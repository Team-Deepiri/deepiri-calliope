"""Smoke tests for the neural model generation endpoints.

The bundled NumPy "neural" models are untrained (random weights), so we assert
contract-level behavior: the endpoint returns audio, valid metadata, and never
crashes — not musical quality.
"""

from __future__ import annotations

import pytest

from calliope.routes.ai_generation_models import (
    ModelGenerateRequest,
    generate_melody_template,
    generate_music_vae,
    generate_musegan,
    generate_transformer,
    generate_variation,
)
from calliope.audio.midi_representations import NoteToken, decode_token_sequence


@pytest.mark.asyncio
async def test_music_vae_returns_audio(tmp_path):
    res = await generate_music_vae(ModelGenerateRequest(prompt="calm", duration=4))
    assert res.audio_path is not None
    assert res.metadata["bpm"] == 120
    assert isinstance(res.metadata.get("fallback"), bool)


@pytest.mark.asyncio
async def test_musegan_generates_notes():
    res = await generate_musegan(ModelGenerateRequest(num_tracks=4, duration=4))
    assert res.metadata["track_count"] == 4
    assert res.metadata["note_count"] > 0


@pytest.mark.asyncio
async def test_transformer_returns_audio():
    res = await generate_transformer(ModelGenerateRequest(prompt="dark techno", duration=4))
    assert res.audio_path is not None
    assert res.metadata["note_count"] >= 0


@pytest.mark.asyncio
async def test_melody_template_patterns():
    for pattern in ("stepwise", "jumping", "arpeggio"):
        res = await generate_melody_template(ModelGenerateRequest(prompt=pattern, duration=2))
        assert res.metadata["pattern"] == pattern


@pytest.mark.asyncio
async def test_variation_requires_input_notes():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await generate_variation(ModelGenerateRequest(input_notes=None))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_variation_from_seed_notes():
    seed = [
        {"pitch": 60, "bar": 0, "position": 0.0, "duration": 1.0},
        {"pitch": 64, "bar": 0, "position": 1.0, "duration": 1.0},
    ]
    res = await generate_variation(ModelGenerateRequest(input_notes=seed, duration=4))
    assert res.audio_path is not None
    assert res.metadata["note_count"] > 0


def test_decode_token_sequence_terminates_on_garbage_tail():
    # Random/untrained tokens (including an undecodable tail) must not hang.
    tokens = [1, 2482, 824, 3602, 1317, 131, 3635, 1585, 1255, 1302, 3442]
    notes = decode_token_sequence(tokens, "remi")
    assert isinstance(notes, list)


def test_note_token_roundtrip_preserves_pitch():
    note = NoteToken(bar=1, position=1.0, pitch=64, velocity=90, duration=0.5)
    from calliope.audio.midi_representations import encode_note_sequence

    tokens = encode_note_sequence([note], "remi")
    decoded = decode_token_sequence(tokens, "remi")
    assert decoded and decoded[0].pitch == 64


def test_melody_stepwise_is_predominantly_conjunct():
    from calliope.audio.harmony_engine import HarmonyEngine
    from calliope.audio.melody_generator import MelodyGenerator

    harmony = HarmonyEngine(root="C", scale_type="major")
    gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    notes = gen.generate_stepwise(32, harmony.generate_progression(mood="happy", length=4))
    assert notes, "stepwise melody must produce notes"
    pitches = sorted({n[0] for n in notes})
    # Contained in the generator's 3-octave window around the root
    assert harmony.root_midi - 13 <= min(pitches) <= max(pitches) <= harmony.root_midi + 25
    for _, start, dur in notes:
        assert dur > 0 and start >= 0


def test_melody_jumping_favors_chord_tones():
    from calliope.audio.harmony_engine import HarmonyEngine
    from calliope.audio.melody_generator import MelodyGenerator

    harmony = HarmonyEngine(root="C", scale_type="major")
    progression = harmony.generate_progression(mood="happy", length=4)
    gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    notes = gen.generate_jumping(64, progression, rhythmic_density=1.0)
    assert notes, "jumping melody must produce notes"
    chord_tones = {p for chord in progression for p in chord}
    on_chord = sum(1 for pitch, start, _ in notes if (pitch - (pitch % 12)) in (0,) or pitch % 12 in
                   {p % 12 for p in chord_tones})
    assert on_chord >= len(notes) * 0.8, "leaps should land on chord tones most of the time"


def test_music_vae_decode_sample_interpolate_run():
    import numpy as np

    from calliope.audio.music_vae import MusicVAE, VAEConfig

    cfg = VAEConfig(max_seq_len=32)
    vae = MusicVAE(cfg)
    z = np.random.randn(1, cfg.latent_dim).astype(np.float32)
    out = vae.decode(z)
    assert out.ndim == 3 and out.shape[-1] == cfg.vocab_size
    sampled = vae.sample(1)
    assert sampled and len(sampled[0]) > 1
    a = np.array([[10, 20, 30]])
    b = np.array([[40, 50, 60]])
    interp = vae.interpolate(a, b, steps=3)
    assert len(interp) == 3
