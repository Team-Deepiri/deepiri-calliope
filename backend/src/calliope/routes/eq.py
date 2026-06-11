from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import numpy as np

from calliope.audio.parametric_eq import ParametricEQ, EQBand, EQ_PRESETS
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.audio.stft import stft_magnitude
from calliope.config import get_settings

router = APIRouter(tags=["eq"])


class EQBandIn(BaseModel):
    frequency: float = Field(..., ge=20.0, le=20000.0)
    gain: float = Field(0.0, ge=-24.0, le=24.0)
    q: float = 1.0
    band_type: str = "peaking"


class EQProcessRequest(BaseModel):
    file: str
    bands: list[EQBandIn] = Field(default_factory=list)
    preset: str | None = None
    sample_rate: int | None = None


class EQProcessResponse(BaseModel):
    output_path: str
    bands_applied: int
    preset_used: str | None = None


class EQAnalyzeResponse(BaseModel):
    frequencies: list[float]
    magnitudes_db: list[float]
    spectral_centroid_hz: float
    spectral_rolloff_hz: float


def _spectral_centroid(samples: np.ndarray, sr: int) -> float:
    mag, _ = stft_magnitude(samples, n_fft=4096, hop=2048, sr=sr)
    freqs = np.fft.rfftfreq(4096, 1.0 / sr)
    mean_mag = np.mean(mag, axis=0)
    if np.sum(mean_mag) < 1e-12:
        return 0.0
    return float(np.sum(freqs * mean_mag) / np.sum(mean_mag))


def _spectral_rolloff(samples: np.ndarray, sr: int, rolloff_percent: float = 0.85) -> float:
    mag, _ = stft_magnitude(samples, n_fft=4096, hop=2048, sr=sr)
    freqs = np.fft.rfftfreq(4096, 1.0 / sr)
    mean_mag = np.mean(mag, axis=0)
    total = np.sum(mean_mag)
    if total < 1e-12:
        return 0.0
    cumsum = np.cumsum(mean_mag)
    idx = np.searchsorted(cumsum, total * rolloff_percent)
    return float(freqs[min(idx, len(freqs) - 1)])


@router.post("/v1/eq/process", response_model=EQProcessResponse)
async def eq_process(body: EQProcessRequest) -> EQProcessResponse:
    eq = ParametricEQ(sr=48000)

    if body.preset:
        if body.preset not in EQ_PRESETS:
            raise HTTPException(status_code=400, detail=f"Unknown preset: {body.preset}. Available: {list(EQ_PRESETS.keys())}")
        eq.load_preset(body.preset)
    else:
        for b in body.bands:
            eq.add_band(EQBand(frequency=b.frequency, gain=b.gain, q=b.q, band_type=b.band_type))

    samples, sr = read_audio_file(body.file, sr=body.sample_rate)
    processed = eq.process(samples)

    settings = get_settings()
    output_dir = settings.processed_path / "eq"
    output_dir.mkdir(parents=True, exist_ok=True)
    src = Path(body.file)
    output_path = output_dir / f"{src.stem}_eq.wav"
    write_audio_file(output_path, processed, sr, format="wav")

    return EQProcessResponse(output_path=str(output_path), bands_applied=len(eq.bands), preset_used=body.preset)


@router.get("/v1/eq/presets")
async def eq_presets() -> dict:
    presets = {}
    for name, bands in EQ_PRESETS.items():
        presets[name] = [
            {"frequency": b.frequency, "gain": b.gain, "q": b.q, "band_type": b.band_type}
            for b in bands
        ]
    return {"presets": presets}


@router.post("/v1/eq/analyze", response_model=EQAnalyzeResponse)
async def eq_analyze(file: str) -> EQAnalyzeResponse:
    samples, sr = read_audio_file(file)
    if samples.ndim == 2:
        samples = np.mean(samples, axis=0)
    mag, _ = stft_magnitude(samples, n_fft=4096, hop=2048, sr=sr)
    freqs = np.fft.rfftfreq(4096, 1.0 / sr)
    mean_mag = np.mean(mag, axis=0)
    centroid = _spectral_centroid(samples, sr)
    rolloff = _spectral_rolloff(samples, sr)
    return EQAnalyzeResponse(
        frequencies=freqs.tolist(),
        magnitudes_db=(20 * np.log10(mean_mag + 1e-10)).tolist(),
        spectral_centroid_hz=centroid,
        spectral_rolloff_hz=rolloff,
    )
