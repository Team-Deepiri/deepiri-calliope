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
