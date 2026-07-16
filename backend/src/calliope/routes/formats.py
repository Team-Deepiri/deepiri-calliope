from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.io import convert_format, get_audio_info, SupportedFormat, read_audio_file, write_audio_file

router = APIRouter(tags=["audio-formats"])

_SUPPORTED_FORMATS: dict[str, dict] = {
    "wav": {"description": "Waveform audio (lossless)", "extensions": [".wav"], "mime": "audio/wav"},
    "mp3": {"description": "MPEG Layer 3 (lossy, compressed)", "extensions": [".mp3"], "mime": "audio/mpeg"},
    "flac": {"description": "Free Lossless Audio Codec", "extensions": [".flac"], "mime": "audio/flac"},
    "ogg": {"description": "Ogg Vorbis (lossy, compressed)", "extensions": [".ogg"], "mime": "audio/ogg"},
    "m4a": {"description": "MPEG-4 Audio (AAC/ALAC)", "extensions": [".m4a"], "mime": "audio/mp4"},
    "aac": {"description": "Advanced Audio Coding", "extensions": [".aac"], "mime": "audio/aac"},
}


class ConvertRequest(BaseModel):
    file: str
    target_format: SupportedFormat = "wav"
    sample_rate: int | None = None
    bit_depth: int = 24


class ConvertResponse(BaseModel):
    output_path: str
    source_format: str
    target_format: str
    duration_sec: float


class AnalyzeResponse(BaseModel):
    path: str
    duration_sec: float
    sample_rate: int
    channels: int
    frames: int
    format: str
    subtype: str


@router.post("/v1/formats/convert", response_model=ConvertResponse)
async def convert_audio(body: ConvertRequest) -> ConvertResponse:
    src = Path(body.file)
    if not src.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {body.file}")
    info = get_audio_info(src)
    ext = body.target_format
    dst = src.with_suffix(f".{ext}")
    convert_format(src, dst, output_format=ext, sr=body.sample_rate, bit_depth=body.bit_depth)
    return ConvertResponse(output_path=str(dst), source_format=info["format"], target_format=ext, duration_sec=info["duration_sec"])


@router.get("/v1/formats/supported")
async def list_supported_formats() -> dict:
    return {"formats": _SUPPORTED_FORMATS}


@router.post("/v1/formats/analyze", response_model=AnalyzeResponse)
async def analyze_audio(file_path: str) -> AnalyzeResponse:
    path = Path(file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    info = get_audio_info(path)
    return AnalyzeResponse(
        path=str(path),
        duration_sec=info["duration_sec"],
        sample_rate=info["sample_rate"],
        channels=info["channels"],
        frames=info["frames"],
        format=info["format"],
        subtype=info["subtype"],
    )
