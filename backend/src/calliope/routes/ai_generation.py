from __future__ import annotations

from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.drum_machine import DrumMachine, DrumPattern
from calliope.audio.conductor import Conductor
from calliope.audio.stem_separation import separate_audio_stems
from calliope.audio.io import write_audio_file
from calliope.config import get_settings

router = APIRouter(tags=["ai-generation"])

_ALLOWED_KINDS = frozenset({"melody", "chords", "drums", "full", "transfer_style"})


class GenerateRequest(BaseModel):
    prompt: str = Field(default="", max_length=2000)
    bpm: int = Field(120, ge=20, le=300)
    key: str = "C"
    genre: str | None = None
    duration: int = Field(16, ge=1, le=256)
    model_type: str = "transformer"


class GenerateResponse(BaseModel):
    audio_path: str | None = None
    samples: list[float] | None = None
    sample_rate: int = 48000
    metadata: dict = Field(default_factory=dict)
    kind: str | None = None


def _scale_and_mood(genre: str | None) -> tuple[str, str]:
    """Map free-form genre hints to harmony scale + mood keys."""
    g = (genre or "major").lower()
    if g in {"major", "minor", "dorian", "phrygian", "lydian", "mixolydian"}:
        scale = g
    elif g in {"happy", "bright", "pop"}:
        scale = "major"
    else:
        scale = "minor"
    mood = g if g in {"happy", "sad", "dark", "jazz"} else ("dark" if scale == "minor" else "happy")
    return scale, mood


def _normalize_beat_genre(genre: str | None) -> str:
    g = (genre or "hiphop").lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "hip_hop": "hiphop",
        "boombap": "boom_bap",
        "boom": "boom_bap",
        "uk_garage": "garage",
        "ukgarage": "garage",
        "dnb": "breakbeat",
        "drum_and_bass": "breakbeat",
    }
    return aliases.get(g, g)


def _drum_grid_for_genre(genre: str | None) -> dict[int, list[int]]:
    """Slot 0=kick, 1=snare, 2=closed hat."""
    key = _normalize_beat_genre(genre)
    presets: dict[str, dict[int, list[int]]] = {
        "hiphop": {0: [0, 4, 8, 12], 1: [4, 12], 2: [0, 2, 4, 6, 8, 10, 12, 14]},
        "trap": {0: [0, 8], 1: [4, 12], 2: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]},
        "boom_bap": {0: [0, 8], 1: [4, 12], 2: [2, 6, 10, 14]},
        "house": {0: [0, 4, 8, 12], 1: [4, 12], 2: [2, 6, 10, 14], 4: [1, 5, 9, 13]},
        "garage": {0: [0, 6, 8, 14], 1: [4, 12], 2: [1, 3, 5, 7, 9, 11, 13, 15]},
        "lofi": {0: [0, 10], 1: [4, 12], 2: [1, 5, 9, 13]},
        "breakbeat": {0: [0, 6, 8, 14], 1: [4, 10, 12], 2: [0, 2, 4, 6, 8, 10, 12, 14]},
    }
    return presets.get(key, presets["hiphop"])


def _tune_drum_machine(dm: DrumMachine, genre: str | None) -> None:
    key = _normalize_beat_genre(genre)
    if key == "trap":
        dm.slots[0].decay = 0.35
        dm.slots[2].decay = 0.06
        dm.slots[2].volume = 0.55
    elif key == "boom_bap":
        dm.slots[0].decay = 0.7
        dm.slots[1].decay = 0.45
    elif key == "house":
        dm.slots[0].decay = 0.4
        dm.slots[0].pitch = 1.05
    elif key == "lofi":
        dm.slots[0].decay = 0.85
        dm.slots[0].volume = 0.65
        dm.slots[2].volume = 0.35
    elif key == "garage":
        dm.slots[2].decay = 0.12
        dm.slots[2].volume = 0.5


@router.get("/v1/ai-generate/download/{kind}")
async def download_generated(kind: str) -> FileResponse:
    """Serve the last generated WAV for a known kind (gesture / studio preview)."""
    if kind not in _ALLOWED_KINDS:
        raise HTTPException(status_code=404, detail="Unknown generation kind")
    settings = get_settings()
    filename = {
        "melody": "melody.wav",
        "chords": "chords.wav",
        "drums": "drums.wav",
        "full": "full_song.wav",
        "transfer_style": "styled.wav",
    }[kind]
    path = Path(settings.processed_path) / "ai_generation" / kind / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No generated audio yet")
    return FileResponse(path, media_type="audio/wav", filename=filename)


@router.post("/v1/ai-generate/melody", response_model=GenerateResponse)
async def generate_melody(body: GenerateRequest) -> GenerateResponse:
    scale, mood = _scale_and_mood(body.genre)
    harmony = HarmonyEngine(root=body.key, scale_type=scale)
    progression = harmony.generate_progression(mood=mood, length=8)
    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    melody_notes = melody_gen.generate(body.duration * 4, progression)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "melody"
    output_dir.mkdir(parents=True, exist_ok=True)
    from calliope.audio.synthesizer import generate_sequence
    audio = generate_sequence("lead_synth", melody_notes, sr=48000)
    path = output_dir / "melody.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(
        audio_path=str(path),
        kind="melody",
        metadata={"note_count": len(melody_notes), "bpm": body.bpm, "key": body.key},
    )


@router.post("/v1/ai-generate/chords", response_model=GenerateResponse)
async def generate_chords(body: GenerateRequest) -> GenerateResponse:
    scale, mood = _scale_and_mood(body.genre)
    harmony = HarmonyEngine(root=body.key, scale_type=scale)
    progression = harmony.generate_progression(mood=mood, length=max(2, body.duration // 2))
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "chords"
    output_dir.mkdir(parents=True, exist_ok=True)
    from calliope.audio.synthesizer import generate_sequence
    from calliope.audio.generative_sequencer import Arpeggiator
    arp = Arpeggiator(mode="up", octaves=1, rate=0.25)
    all_notes = []
    for i, chord in enumerate(progression):
        all_notes.extend([(n, i * 4.0 + s, d) for n, s, d in arp.generate(chord, 4.0)])
    # pad_warm is the warm pad preset (pad_synth was never registered)
    audio = generate_sequence("pad_warm", all_notes, sr=48000)
    path = output_dir / "chords.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(
        audio_path=str(path),
        kind="chords",
        metadata={"chord_count": len(progression), "bpm": body.bpm, "key": body.key},
    )


@router.post("/v1/ai-generate/drums", response_model=GenerateResponse)
async def generate_drums(body: GenerateRequest) -> GenerateResponse:
    beat_genre = _normalize_beat_genre(body.genre)
    dm = DrumMachine(sr=48000)
    _tune_drum_machine(dm, beat_genre)
    grid = _drum_grid_for_genre(beat_genre)
    dm.patterns = [DrumPattern("ai_generated", steps=16, grid=grid)]
    audio = dm.render_pattern(0, body.bpm)
    if audio is None or len(audio) == 0:
        audio = np.zeros(int(0.5 * 48000), dtype=np.float64)
    target_len = max(1, int(body.duration * 4 * 60 / body.bpm * 48000))
    repeats = max(1, int(np.ceil(target_len / len(audio))))
    audio = np.tile(audio, repeats)[:target_len]
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "drums"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "drums.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(
        audio_path=str(path),
        kind="drums",
        metadata={"bpm": body.bpm, "bars": body.duration, "beat_genre": beat_genre},
    )


@router.post("/v1/ai-generate/full", response_model=GenerateResponse)
async def generate_full(body: GenerateRequest) -> GenerateResponse:
    scale, mood = _scale_and_mood(body.genre)
    # Short gesture clips render at 24 kHz for lower latency.
    sr = 24000 if body.duration <= 4 else 48000
    cond = Conductor(sr=sr)
    audio = cond.conduct_song(
        prompt=body.prompt,
        bpm=body.bpm,
        key=body.key,
        scale_type=scale,
        mood=mood,
        duration_bars=body.duration,
    )
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "full"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "full_song.wav"
    write_audio_file(path, audio, sr, format="wav")
    return GenerateResponse(
        audio_path=str(path),
        kind="full",
        metadata={"bpm": body.bpm, "key": body.key, "bars": body.duration, "sr": sr},
    )


@router.post("/v1/ai-generate/stems", response_model=GenerateResponse)
async def generate_stems(body: GenerateRequest) -> GenerateResponse:
    scale, mood = _scale_and_mood(body.genre)
    cond = Conductor(sr=48000)
    full_audio = cond.conduct_song(
        prompt=body.prompt,
        bpm=body.bpm,
        key=body.key,
        scale_type=scale,
        mood=mood,
        duration_bars=body.duration,
    )
    stems = separate_audio_stems(full_audio, 48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "stems"
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, audio in stems.items():
        stem_path = output_dir / f"{name}.wav"
        write_audio_file(stem_path, audio, 48000, format="wav")
        paths[name] = str(stem_path)
    return GenerateResponse(metadata={"stems": paths, "bpm": body.bpm})


@router.post("/v1/ai-generate/transfer-style", response_model=GenerateResponse)
async def transfer_style(body: GenerateRequest) -> GenerateResponse:
    scale, mood = _scale_and_mood(body.genre)
    cond = Conductor(sr=48000)
    audio = cond.conduct_song(
        prompt=f"{body.prompt} style transfer {body.genre or 'default'}",
        bpm=body.bpm,
        key=body.key,
        scale_type=scale,
        mood=mood,
        duration_bars=body.duration,
    )
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "transfer_style"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "styled.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(
        audio_path=str(path),
        kind="transfer_style",
        metadata={"bpm": body.bpm, "key": body.key, "style": body.genre},
    )
