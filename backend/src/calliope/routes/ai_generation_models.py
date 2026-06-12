from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.music_vae import MusicVAE, VAEConfig
from calliope.audio.musegan import MuseGAN, MuseGANConfig
from calliope.audio.music_transformer import MusicTransformerModel, TransformerConfig
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.io import write_audio_file
from calliope.audio.synthesizer import generate_sequence
from calliope.config import get_settings

router = APIRouter(tags=["ai-generation-models"])


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


@router.post("/v1/ai-generate/music-vae", response_model=ModelGenerateResponse)
async def generate_music_vae(body: ModelGenerateRequest) -> ModelGenerateResponse:
    config = VAEConfig()
    vae = MusicVAE(config)
    z_a = vae.encode_style(body.style_a or "default")
    z_b = vae.encode_style(body.style_b or "default")
    interp = vae.interpolate(z_a, z_b, steps=body.duration)
    notes = vae.decode(interp, temperature=body.temperature)
    audio = generate_sequence("lead_synth", notes, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "music_vae"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "vae_interp.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(audio_path=str(path), metadata={"note_count": len(notes), "bpm": body.bpm, "key": body.key})


@router.post("/v1/ai-generate/musegan", response_model=ModelGenerateResponse)
async def generate_musegan(body: ModelGenerateRequest) -> ModelGenerateResponse:
    config = MuseGANConfig()
    musegan = MuseGAN(config)
    tracks = musegan.generate(
        bpm=body.bpm,
        key=body.key,
        bars=body.duration,
        num_tracks=body.num_tracks,
        temperature=body.temperature,
    )
    mix = sum(tracks.values()) / max(len(tracks), 1)
    mix = (mix / (mix.max() + 1e-8) * 0.95).astype(mix.dtype)
    import numpy as np
    audio = np.asarray(mix)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "musegan"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "multitrack.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(audio_path=str(path), metadata={"track_count": len(tracks), "bpm": body.bpm, "key": body.key})


@router.post("/v1/ai-generate/transformer", response_model=ModelGenerateResponse)
async def generate_transformer(body: ModelGenerateRequest) -> ModelGenerateResponse:
    config = TransformerConfig()
    model = MusicTransformerModel(config)
    notes = model.generate(
        prompt=body.prompt,
        bpm=body.bpm,
        max_length=body.duration * 4,
        temperature=body.temperature,
    )
    audio = generate_sequence("lead_synth", notes, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "transformer"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "transformer.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(audio_path=str(path), metadata={"note_count": len(notes), "bpm": body.bpm, "key": body.key})


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
    return ModelGenerateResponse(audio_path=str(path), metadata={"note_count": len(melody_notes), "bpm": body.bpm, "key": body.key, "pattern": pattern})


@router.post("/v1/ai-generate/variation", response_model=ModelGenerateResponse)
async def generate_variation(body: ModelGenerateRequest) -> ModelGenerateResponse:
    if not body.input_notes:
        raise HTTPException(status_code=400, detail="input_notes required for variation")
    config = TransformerConfig()
    model = MusicTransformerModel(config)
    variations = model.generate_variations(
        seed_notes=body.input_notes,
        num_variations=1,
        temperature=body.temperature,
    )
    notes = variations[0] if variations else body.input_notes
    audio = generate_sequence("lead_synth", notes, sr=48000)
    settings = get_settings()
    output_dir = settings.processed_path / "ai_generation" / "variation"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "variation.wav"
    write_audio_file(path, audio, 48000, format="wav")
    return ModelGenerateResponse(audio_path=str(path), metadata={"note_count": len(notes), "bpm": body.bpm, "key": body.key})
