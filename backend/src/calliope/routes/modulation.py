"""Modulation effects API routes."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from calliope.audio.automation import LFOGenerator
from calliope.audio.modulation_suite import ChorusEffect, PhaserEffect, Bitcrusher

router = APIRouter(prefix="/v1/modulation", tags=["modulation"])

_lfo_gen = LFOGenerator()
_chorus = ChorusEffect()
_phaser = PhaserEffect()
_bitcrusher = Bitcrusher()

WAVEFORMS = ["sine", "square", "triangle", "sawtooth", "smooth_square", "random"]


class LFORequest(BaseModel):
    num_samples: int
    waveform: str = "sine"
    frequency: float = 1.0
    amplitude: float = 1.0
    offset: float = 0.0


class EnvelopeFollowerRequest(BaseModel):
    audio: list[float]
    attack_ms: float = 10.0
    release_ms: float = 50.0


class ApplyModulationRequest(BaseModel):
    audio: list[float]
    carrier: list[float]
    depth: float = 1.0
    mode: str = "multiply"


@router.post("/lfo")
async def generate_modulation_lfo(req: LFORequest) -> dict:
    signal = _lfo_gen.generate(
        num_samples=req.num_samples,
        frequency=req.frequency,
        waveform=req.waveform,
        amplitude=req.amplitude,
        offset=req.offset,
    )
    return {"signal": signal.tolist(), "waveform": req.waveform}


@router.post("/envelope-follower")
async def envelope_follower(req: EnvelopeFollowerRequest) -> dict:
    audio = np.array(req.audio, dtype=np.float64)
    n = len(audio)
    envelope = np.zeros(n)
    attack_coef = np.exp(-1.0 / (req.attack_ms * 48000 / 1000))
    release_coef = np.exp(-1.0 / (req.release_ms * 48000 / 1000))
    env = 0.0
    for i in range(n):
        level = abs(audio[i])
        if level > env:
            env = attack_coef * env + (1 - attack_coef) * level
        else:
            env = release_coef * env + (1 - release_coef) * level
        envelope[i] = env
    return {"envelope": envelope.tolist()}


@router.post("/apply")
async def apply_modulation(req: ApplyModulationRequest) -> dict:
    audio = np.array(req.audio, dtype=np.float64)
    carrier = np.array(req.carrier, dtype=np.float64)
    min_len = min(len(audio), len(carrier))
    audio = audio[:min_len]
    carrier = carrier[:min_len]
    if req.mode == "multiply":
        result = audio * (1.0 + req.depth * (carrier - 1.0))
    elif req.mode == "add":
        result = audio + carrier * req.depth
    elif req.mode == "ring":
        result = audio * carrier * req.depth
    else:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")
    peak = np.max(np.abs(result))
    if peak > 1.0:
        result = result / peak * 0.95
    return {"samples": result.tolist(), "mode": req.mode}


@router.get("/waveforms")
async def list_modulation_waveforms() -> dict:
    return {"waveforms": WAVEFORMS}
