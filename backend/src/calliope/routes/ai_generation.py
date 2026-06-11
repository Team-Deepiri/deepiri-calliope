from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.music_transformer import MusicTransformerModel, TransformerConfig
from calliope.audio.music_vae import MusicVAE, VAEConfig
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.drum_machine import DrumMachine, DrumPattern
from calliope.audio.conductor import Conductor
from calliope.audio.stem_separation import separate_audio_stems
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(tags=["ai-generation"])


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


@router.post("/v1/ai-generate/melody", response_model=GenerateResponse)
async def generate_melody(body: GenerateRequest) -> GenerateResponse:
    harmony = HarmonyEngine(root=body.key, scale_type=body.genre or "major")
    progression = harmony.generate_progression(mood=body.genre or "happy", length=8)
    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    melody_notes = melody_gen.generate(body.duration * 4, progression)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "melody"
    output_dir.mkdir(parents=True, exist_ok=True)
    from calliope.audio.synthesizer import generate_sequence
    audio = generate_sequence("lead_synth", melody_notes, sr=48000)
    path = output_dir / "melody.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(audio_path=str(path), metadata={"note_count": len(melody_notes), "bpm": body.bpm, "key": body.key})


@router.post("/v1/ai-generate/chords", response_model=GenerateResponse)
async def generate_chords(body: GenerateRequest) -> GenerateResponse:
    harmony = HarmonyEngine(root=body.key, scale_type=body.genre or "major")
    progression = harmony.generate_progression(mood=body.genre or "happy", length=body.duration // 2)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "chords"
    output_dir.mkdir(parents=True, exist_ok=True)
    from calliope.audio.synthesizer import generate_sequence
    from calliope.audio.generative_sequencer import Arpeggiator
    arp = Arpeggiator(mode="up", octaves=1, rate=0.25)
    all_notes = []
    for i, chord in enumerate(progression):
        all_notes.extend([(n, i * 4.0 + s, d) for n, s, d in arp.generate(chord, 4.0)])
    audio = generate_sequence("pad_synth", all_notes, sr=48000)
    path = output_dir / "chords.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(audio_path=str(path), metadata={"chord_count": len(progression), "bpm": body.bpm, "key": body.key})


@router.post("/v1/ai-generate/drums", response_model=GenerateResponse)
async def generate_drums(body: GenerateRequest) -> GenerateResponse:
    dm = DrumMachine(sr=48000)
    from calliope.audio.generative_sequencer import EuclideanGenerator
    kick_pat = EuclideanGenerator(16, 4).generate()
    hat_pat = EuclideanGenerator(16, 8).generate()
    snare_pat = EuclideanGenerator(16, 3).generate()
    dm.patterns = [DrumPattern(
        "ai_generated",
        steps=16,
        grid={
            0: [i for i, v in enumerate(kick_pat) if v],
            2: [i for i, v in enumerate(hat_pat) if v],
            1: [i for i, v in enumerate(snare_pat) if v],
        },
    )]
    audio = dm.render_pattern(0, body.bpm)
    repeats = max(1, body.duration * 4 * 60 // body.bpm * 48000 // len(audio))
    audio = np.tile(audio, repeats)[:body.duration * 4 * 60 // body.bpm * 48000]
    import numpy as np
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "drums"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "drums.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(audio_path=str(path), metadata={"bpm": body.bpm, "bars": body.duration})


@router.post("/v1/ai-generate/full", response_model=GenerateResponse)
async def generate_full(body: GenerateRequest) -> GenerateResponse:
    cond = Conductor(sr=48000)
    audio = cond.conduct_song(
        prompt=body.prompt,
        bpm=body.bpm,
        key=body.key,
        scale_type=body.genre or "minor",
        mood=body.genre or "dark",
        duration_bars=body.duration,
    )
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "full"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "full_song.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(audio_path=str(path), metadata={"bpm": body.bpm, "key": body.key, "bars": body.duration})


@router.post("/v1/ai-generate/stems", response_model=GenerateResponse)
async def generate_stems(body: GenerateRequest) -> GenerateResponse:
    cond = Conductor(sr=48000)
    full_audio = cond.conduct_song(
        prompt=body.prompt,
        bpm=body.bpm,
        key=body.key,
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
    cond = Conductor(sr=48000)
    audio = cond.conduct_song(
        prompt=f"{body.prompt} style transfer {body.genre or 'default'}",
        bpm=body.bpm,
        key=body.key,
        mood=body.genre or "dark",
        duration_bars=body.duration,
    )
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "transfer_style"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "styled.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return GenerateResponse(audio_path=str(path), metadata={"bpm": body.bpm, "key": body.key, "style": body.genre})
