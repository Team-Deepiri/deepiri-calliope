"""Parameter automation API routes."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from calliope.audio.automation import AutomationEngine, AutomationCurve, LFOGenerator, ADSREnvelope, SidechainAutomation

router = APIRouter(prefix="/v1/automation", tags=["automation"])

_engine = AutomationEngine()
_lfo_gen = LFOGenerator()
_adsr_gen = ADSREnvelope()
_sidechain = SidechainAutomation()


class CreateTrackRequest(BaseModel):
    name: str
    min_value: float = 0.0
    max_value: float = 1.0


class AddPointRequest(BaseModel):
    time_ms: float
    value: float
    curve: str = "linear"


class GenerateEnvelopeRequest(BaseModel):
    track_name: str
    duration_ms: float
    sample_rate: int = 48000


class ApplyAutomationRequest(BaseModel):
    track_name: str
    samples: list[float]
    sample_rate: int = 48000


class LFORequest(BaseModel):
    num_samples: int
    frequency: float = 1.0
    waveform: str = "sine"
    amplitude: float = 1.0
    offset: float = 0.0


class ADSRRequest(BaseModel):
    num_samples: int
    attack_ms: float = 10.0
    decay_ms: float = 100.0
    sustain_level: float = 0.7
    release_ms: float = 200.0
    gate_on: int | None = None
    gate_off: int | None = None


class SidechainRequest(BaseModel):
    audio: list[float]
    attack_ms: float = 5.0
    release_ms: float = 50.0
    threshold: float = 0.1
    depth: float = 0.5
    ceiling: float = 1.0


@router.post("/track")
async def create_automation_track(req: CreateTrackRequest) -> dict:
    _engine.add_track(req.name, req.min_value, req.max_value)
    return {"status": "ok", "track_name": req.name}


@router.post("/track/{track_name}/point")
async def add_automation_point(track_name: str, req: AddPointRequest) -> dict:
    try:
        curve = AutomationCurve(req.curve)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid curve: {req.curve}")
    _engine.add_point(track_name, req.time_ms, req.value, curve)
    return {"status": "ok", "track_name": track_name}


@router.get("/track/{track_name}")
async def get_automation_track(track_name: str) -> dict:
    track = _engine.get_track(track_name)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return {
        "name": track.name,
        "min_value": track.min_value,
        "max_value": track.max_value,
        "points": [
            {"time_ms": p.time_ms, "value": p.value, "curve": p.curve.value}
            for p in track.points
        ],
    }


@router.post("/track/{track_name}/envelope")
async def generate_envelope_route(track_name: str, req: GenerateEnvelopeRequest) -> dict:
    envelope = _engine.generate_envelope(track_name, req.duration_ms, req.sample_rate)
    return {
        "track_name": track_name,
        "envelope": envelope.tolist(),
        "duration_ms": req.duration_ms,
        "sample_rate": req.sample_rate,
    }


@router.post("/apply")
async def apply_automation(req: ApplyAutomationRequest) -> dict:
    samples = np.array(req.samples, dtype=np.float64)
    output = _engine.apply_to_samples(
        samples, req.track_name,
        processor=lambda block, val: block * val,
        sample_rate=req.sample_rate,
    )
    return {"samples": output.tolist(), "sample_rate": req.sample_rate}


@router.post("/lfo")
async def generate_lfo_route(req: LFORequest) -> dict:
    signal = _lfo_gen.generate(
        num_samples=req.num_samples,
        frequency=req.frequency,
        waveform=req.waveform,
        amplitude=req.amplitude,
        offset=req.offset,
    )
    return {"signal": signal.tolist()}


@router.post("/adsr")
async def generate_adsr_route(req: ADSRRequest) -> dict:
    envelope = _adsr_gen.generate(
        num_samples=req.num_samples,
        attack_ms=req.attack_ms,
        decay_ms=req.decay_ms,
        sustain_level=req.sustain_level,
        release_ms=req.release_ms,
        gate_on=req.gate_on,
        gate_off=req.gate_off,
    )
    return {"envelope": envelope.tolist()}


@router.post("/sidechain")
async def generate_sidechain_route(req: SidechainRequest) -> dict:
    audio = np.array(req.audio, dtype=np.float64)
    envelope = _sidechain.generate(
        audio,
        attack_ms=req.attack_ms,
        release_ms=req.release_ms,
        threshold=req.threshold,
        depth=req.depth,
        ceiling=req.ceiling,
    )
    return {"envelope": envelope.tolist()}


@router.delete("/track/{track_name}")
async def delete_automation_track(track_name: str) -> dict:
    if not _engine.get_track(track_name):
        raise HTTPException(status_code=404, detail="Track not found")
    _engine._tracks.pop(track_name, None)
    return {"status": "deleted", "track_name": track_name}


@router.get("/tracks")
async def list_automation_tracks() -> dict:
    tracks = []
    for name in list(_engine._tracks.keys()):
        track = _engine.get_track(name)
        if track:
            tracks.append({
                "name": track.name,
                "point_count": len(track.points),
                "min_value": track.min_value,
                "max_value": track.max_value,
            })
    return {"tracks": tracks}
