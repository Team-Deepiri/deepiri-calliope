from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.music_vae import MusicVAE, VAEConfig
from calliope.audio.musegan import MuseGAN, MuseGANConfig
from calliope.audio.music_transformer import MusicTransformerModel, TransformerConfig
from calliope.audio.midi_representations import NoteToken, decode_token_sequence
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.io import write_audio_file
from calliope.audio.synthesizer import generate_sequence
from calliope.config import get_settings

router = APIRouter(tags=["ai-generation-models"])

_NOTE_FIELDS = {f for f in NoteToken.__dataclass_fields__}


class ModelGenerateRequest(BaseModel):
    prompt: str = Field(default="", max_length=2000)
    bpm: int = Field(120, ge=20, le=300)
    key: str = "C"
    genre: str | None = None
    duration: int = Field(16, ge=1, le=256)
    style_a: str | None = None
    style_b: str | None = None
    num_tracks: int = Field(4, ge=1, le=16)
    temperature: float = Field(1.0, ge=0.0, le=2.0)
    input_notes: list[dict] | None = None


class ModelGenerateResponse(BaseModel):
    audio_path: str | None = None
    samples: list[float] | None = None
    sample_rate: int = 48000
    metadata: dict = Field(default_factory=dict)


def _notes_to_tuples(notes: list[NoteToken], bpm: int) -> list[tuple[int, float, float]]:
    """NoteToken (bar/position/duration in beats) -> (midi, start_sec, duration_sec)."""
    sec_per_beat = 60.0 / max(bpm, 1)
    return [
        (
            int(note.pitch),
            note.bar * 4 * sec_per_beat + note.position * sec_per_beat,
            max(note.duration * sec_per_beat, 0.05),
        )
        for note in notes
    ]


def _pad_tokens(tokens: list[int], max_seq_len: int) -> np.ndarray:
    arr = np.full((1, max_seq_len), 0, dtype=np.int32)
    arr[0, : min(len(tokens), max_seq_len)] = tokens[:max_seq_len]
    return arr


def _coerce_note_tokens(raw: list[dict]) -> list[NoteToken]:
    notes: list[NoteToken] = []
    for item in raw:
        try:
            notes.append(NoteToken(**{k: v for k, v in item.items() if k in _NOTE_FIELDS}))
        except TypeError:
            continue
    return notes


def _fallback_tuples(prompt: str, bpm: int, duration: int) -> list[tuple[int, float, float]]:
    """Audible deterministic fallback when model tokens decode to nothing."""
    harmony = HarmonyEngine(root="C", scale_type="major")
    progression = harmony.generate_progression(mood="happy", length=4)
    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    return melody_gen.generate(max(duration * 4, 8), progression)


@router.post("/v1/ai-generate/music-vae", response_model=ModelGenerateResponse)
async def generate_music_vae(body: ModelGenerateRequest) -> ModelGenerateResponse:
    # Cap the decode horizon: the sampler stops at EOS or max_seq_len, and the
    # untrained prior rarely emits EOS — a full 2048-step decode is minutes slow.
    config = VAEConfig(max_seq_len=min(VAEConfig.max_seq_len, 64))
    vae = MusicVAE(config)

    # Sample two sequences from the latent prior as stand-ins for style A/B,
    # then interpolate between their latent encodings.
    tokens_a = vae.sample(num_samples=1, temperature=body.temperature)[0]
    tokens_b = vae.sample(num_samples=1, temperature=body.temperature)[0]
    steps = max(2, min(body.duration, 4))
    interp = vae.interpolate(
        _pad_tokens(tokens_a, config.max_seq_len),
        _pad_tokens(tokens_b, config.max_seq_len),
        steps=steps,
    )
    notes = decode_token_sequence(interp[-1], "remi")
    note_tuples = _notes_to_tuples(notes, body.bpm)
    fell_back = False
    if not note_tuples:
        note_tuples = _fallback_tuples(body.prompt, body.bpm, body.duration)
        fell_back = True
    audio = generate_sequence("lead_synth", note_tuples, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "music_vae"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "vae_interp.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(
        audio_path=str(path),
        metadata={
            "note_count": len(note_tuples),
            "bpm": body.bpm,
            "key": body.key,
            "fallback": fell_back,
        },
    )


@router.post("/v1/ai-generate/musegan", response_model=ModelGenerateResponse)
async def generate_musegan(body: ModelGenerateRequest) -> ModelGenerateResponse:
    config = MuseGANConfig(num_tracks=body.num_tracks)
    musegan = MuseGAN(config)
    pianoroll = musegan.generate_tracks(batch=1)
    # (pitch, track_index, start_time, duration) per batch element.
    batch_notes = musegan.to_midi_notes(pianoroll)[0]
    note_tuples = [(int(pitch), float(start), float(dur)) for pitch, _track, start, dur in batch_notes]
    audio = generate_sequence("lead_synth", note_tuples, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "musegan"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "multitrack.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(
        audio_path=str(path),
        metadata={
            "track_count": body.num_tracks,
            "note_count": len(note_tuples),
            "bpm": body.bpm,
            "key": body.key,
        },
    )


@router.post("/v1/ai-generate/transformer", response_model=ModelGenerateResponse)
async def generate_transformer(body: ModelGenerateRequest) -> ModelGenerateResponse:
    config = TransformerConfig()
    model = MusicTransformerModel(config)
    tokens = model.generate(max_length=body.duration * 4, temperature=body.temperature)
    notes = decode_token_sequence(tokens, "remi")
    note_tuples = _notes_to_tuples(notes, body.bpm)
    fell_back = False
    if not note_tuples:
        note_tuples = _fallback_tuples(body.prompt, body.bpm, body.duration)
        fell_back = True
    audio = generate_sequence("lead_synth", note_tuples, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "transformer"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "transformer.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(
        audio_path=str(path),
        metadata={
            "note_count": len(note_tuples),
            "bpm": body.bpm,
            "key": body.key,
            "fallback": fell_back,
        },
    )


@router.post("/v1/ai-generate/melody-template", response_model=ModelGenerateResponse)
async def generate_melody_template(body: ModelGenerateRequest) -> ModelGenerateResponse:
    harmony = HarmonyEngine(root=body.key, scale_type=body.genre or "major")
    progression = harmony.generate_progression(mood=body.genre or "happy", length=8)
    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    pattern = body.prompt or "arpeggio"
    if pattern == "stepwise":
        melody_notes = melody_gen.generate_stepwise(body.duration * 4, progression)
    elif pattern == "jumping":
        melody_notes = melody_gen.generate_jumping(body.duration * 4, progression)
    else:
        melody_notes = melody_gen.generate(body.duration * 4, progression)
    audio = generate_sequence("lead_synth", melody_notes, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "melody_template"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "template.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(
        audio_path=str(path),
        metadata={"note_count": len(melody_notes), "bpm": body.bpm, "key": body.key, "pattern": pattern},
    )


@router.post("/v1/ai-generate/variation", response_model=ModelGenerateResponse)
async def generate_variation(body: ModelGenerateRequest) -> ModelGenerateResponse:
    if not body.input_notes:
        raise HTTPException(status_code=400, detail="input_notes required for variation")
    seed_notes = _coerce_note_tokens(body.input_notes)
    if not seed_notes:
        raise HTTPException(status_code=400, detail="input_notes did not contain any valid note fields")
    config = TransformerConfig()
    model = MusicTransformerModel(config)
    notes = model.generate_from_notes(seed_notes, max_new_tokens=body.duration * 4)
    note_tuples = _notes_to_tuples(notes, body.bpm)
    audio = generate_sequence("lead_synth", note_tuples, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "variation"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "variation.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(
        audio_path=str(path),
        metadata={"note_count": len(note_tuples), "bpm": body.bpm, "key": body.key},
    )
