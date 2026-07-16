from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.io import read_audio_file, get_audio_info
from calliope.audio.beat_sync import TempoDetector
from calliope.config import get_settings

router = APIRouter(tags=["loop-library"])

_loop_library: dict[str, dict] = {}
_loop_categories: dict[str, list[str]] = {}


class LoopOut(BaseModel):
    id: str
    name: str
    path: str
    category: str | None = None
    bpm: float | None = None
    key: str | None = None
    tags: list[str] = Field(default_factory=list)
    duration_sec: float = 0.0
    sample_rate: int = 48000
    channels: int = 1


@router.get("/v1/loops/library/categories")
async def list_categories() -> dict:
    settings = get_settings()
    loops_dir = settings.processed_path / "loops"
    categories = {}
    if loops_dir.exists():
        for cat_dir in loops_dir.iterdir():
            if cat_dir.is_dir():
                files = [f.name for f in cat_dir.glob("*") if f.suffix.lower() in (".wav", ".mp3", ".ogg", ".flac")]
                if files:
                    categories[cat_dir.name] = files
    return {"categories": list(categories.keys()), "files_by_category": categories}


@router.get("/v1/loops/library/search")
async def search_loops(
    query: str | None = None,
    bpm_min: float | None = None,
    bpm_max: float | None = None,
    key: str | None = None,
    category: str | None = None,
    tags: str | None = None,
) -> dict:
    settings = get_settings()
    loops_dir = settings.processed_path / "loops"
    results: list[LoopOut] = []

    if not loops_dir.exists():
        return {"loops": [], "count": 0}

    search_dirs = [loops_dir / category] if category else [d for d in loops_dir.iterdir() if d.is_dir()]
    for search_dir in search_dirs:
        for fpath in search_dir.glob("*"):
            if fpath.suffix.lower() not in (".wav", ".mp3", ".ogg", ".flac"):
                continue
            if query and query.lower() not in fpath.stem.lower():
                continue
            info = get_audio_info(fpath)
            detector = TempoDetector(sr=info["sample_rate"])
            samples, sr = read_audio_file(fpath)
            tempo, _ = detector.detect_bpm(samples, bpm_min or 60.0, bpm_max or 200.0)
            if bpm_min is not None and tempo < bpm_min:
                continue
            if bpm_max is not None and tempo > bpm_max:
                continue
            results.append(LoopOut(
                id=fpath.stem,
                name=fpath.stem,
                path=str(fpath),
                category=search_dir.name,
                bpm=tempo,
                duration_sec=info["duration_sec"],
                sample_rate=info["sample_rate"],
                channels=info["channels"],
            ))

    return {"loops": [r.model_dump() for r in results], "count": len(results)}


@router.get("/v1/loops/library/{loop_id}")
async def get_loop(loop_id: str, category: str | None = None) -> LoopOut:
    settings = get_settings()
    search_dirs = [settings.processed_path / "loops" / category] if category else [settings.processed_path / "loops"]
    for search_dir in search_dirs:
        for fpath in search_dir.glob(f"{loop_id}.*"):
            if fpath.suffix.lower() in (".wav", ".mp3", ".ogg", ".flac"):
                info = get_audio_info(fpath)
                detector = TempoDetector(sr=info["sample_rate"])
                samples, sr = read_audio_file(fpath)
                tempo, _ = detector.detect_bpm(samples, 60.0, 200.0)
                return LoopOut(
                    id=fpath.stem,
                    name=fpath.stem,
                    path=str(fpath),
                    category=search_dir.name if search_dir.is_dir() else None,
                    bpm=tempo,
                    duration_sec=info["duration_sec"],
                    sample_rate=info["sample_rate"],
                    channels=info["channels"],
                )
    raise HTTPException(status_code=404, detail=f"Loop not found: {loop_id}")


@router.get("/v1/loops/library/{loop_id}/audio")
async def get_loop_audio(loop_id: str, category: str | None = None) -> dict:
    settings = get_settings()
    search_dirs = [settings.processed_path / "loops" / category] if category else [settings.processed_path / "loops"]
    for search_dir in search_dirs:
        for fpath in search_dir.glob(f"{loop_id}.*"):
            if fpath.suffix.lower() in (".wav", ".mp3", ".ogg", ".flac"):
                with open(fpath, "rb") as f:
                    import base64
                    audio_b64 = base64.b64encode(f.read()).decode("utf-8")
                return {
                    "loop_id": loop_id,
                    "filename": fpath.name,
                    "audio_base64": audio_b64,
                    "mime_type": f"audio/{fpath.suffix.lstrip('.')}",
                }
    raise HTTPException(status_code=404, detail=f"Loop not found: {loop_id}")


@router.get("/v1/loops/library/similar/{loop_id}")
async def get_similar_loops(loop_id: str, category: str | None = None, limit: int = 5) -> dict:
    settings = get_settings()
    loops_dir = settings.processed_path / "loops"
    similar: list[LoopOut] = []
    search_dir = loops_dir / category if category else loops_dir
    if not search_dir.exists():
        return {"loops": [], "count": 0}
    for fpath in search_dir.glob("*"):
        if fpath.suffix.lower() not in (".wav", ".mp3", ".ogg", ".flac"):
            continue
        if fpath.stem == loop_id:
            continue
        info = get_audio_info(fpath)
        similar.append(LoopOut(
            id=fpath.stem,
            name=fpath.stem,
            path=str(fpath),
            category=search_dir.name,
            duration_sec=info["duration_sec"],
        ))
    similar = similar[:limit]
    return {"loops": [r.model_dump() for r in similar], "count": len(similar)}


@router.post("/v1/loops/library/scan")
async def scan_loops(directory: str | None = None) -> dict:
    settings = get_settings()
    base = Path(directory) if directory else settings.processed_path / "loops"
    if not base.exists():
        base.mkdir(parents=True, exist_ok=True)
    found = 0
    for fpath in base.rglob("*"):
        if fpath.suffix.lower() in (".wav", ".mp3", ".ogg", ".flac"):
            found += 1
    return {"scanned_directory": str(base), "loops_found": found}
