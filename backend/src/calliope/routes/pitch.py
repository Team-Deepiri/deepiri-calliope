from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import numpy as np

from calliope.audio.io import read_audio_file, write_audio_file
from calliope.audio.pitch_processor import shift_pitch, detect_pitch, correct_pitch
from calliope.pitch.yin import yin_track_series
from calliope.pitch.hz_cents import hz_to_midi
from calliope.config import get_settings

router = APIRouter(tags=["pitch"])


class PitchShiftRequest(BaseModel):
    file: str
    semitones: float = Field(0.0, ge=-24.0, le=24.0)
    formant_correct: bool = False
    method: str = "phase_vocoder"


class PitchShiftResponse(BaseModel):
    output_path: str
    semitones: float
    duration_sec: float


class PitchDetectResponse(BaseModel):
    f0_hz: list[float]
    voicing_strength: list[float]
    midi_notes: list[float]
    hop_samples: int
    frame_samples: int
    mean_f0_hz: float | None = None


class PitchCorrectRequest(BaseModel):
    file: str
    scale: str = "major"
    root: int = Field(60, ge=0, le=127)
    strength: float = Field(1.0, ge=0.0, le=1.0)


class PitchCorrectResponse(BaseModel):
    output_path: str
    strength: float
    scale: str
    root: int


@router.post("/v1/pitch/shift", response_model=PitchShiftResponse)
async def pitch_shift(body: PitchShiftRequest) -> PitchShiftResponse:
    samples, sr = read_audio_file(body.file)
    shifted = shift_pitch(samples, sr, semitones=body.semitones, formant_correct=body.formant_correct, method=body.method)
    settings = get_settings()
    output_dir = settings.processed_path / "pitch"
    output_dir.mkdir(parents=True, exist_ok=True)
    src = Path(body.file)
    output_path = output_dir / f"{src.stem}_shifted_{body.semitones:+g}st.wav"
    write_audio_file(output_path, shifted, sr, format="wav")
    return PitchShiftResponse(output_path=str(output_path), semitones=body.semitones, duration_sec=len(shifted) / sr)


@router.post("/v1/pitch/detect", response_model=PitchDetectResponse)
async def pitch_detect(file: str, fmin: float = 50.0, fmax: float = 2000.0) -> PitchDetectResponse:
    samples, sr = read_audio_file(file)
    if samples.ndim == 2:
        samples = np.mean(samples, axis=0)
    result = detect_pitch(samples, sr, fmin=fmin, fmax=fmax)
    mean_f0 = np.mean([f for f in result["f0_hz"] if f > 0]) if any(f > 0 for f in result["f0_hz"]) else None
    return PitchDetectResponse(
        f0_hz=result["f0_hz"],
        voicing_strength=result["voicing_strength"],
        midi_notes=result["midi_notes"],
        hop_samples=result["hop_samples"],
        frame_samples=result["frame_samples"],
        mean_f0_hz=mean_f0,
    )


@router.post("/v1/pitch/correct", response_model=PitchCorrectResponse)
async def pitch_correct(body: PitchCorrectRequest) -> PitchCorrectResponse:
    samples, sr = read_audio_file(body.file)
    corrected = correct_pitch(samples, sr, scale=body.scale, root=body.root, strength=body.strength)
    settings = get_settings()
    output_dir = settings.processed_path / "pitch"
    output_dir.mkdir(parents=True, exist_ok=True)
    src = Path(body.file)
    output_path = output_dir / f"{src.stem}_corrected.wav"
    write_audio_file(output_path, corrected, sr, format="wav")
    return PitchCorrectResponse(output_path=str(output_path), strength=body.strength, scale=body.scale, root=body.root)
