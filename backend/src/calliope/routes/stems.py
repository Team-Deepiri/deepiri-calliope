"""Stem separation API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from calliope.audio.stem_separation import separate_audio_stems, extract_vocals
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/stems", tags=["stems"])


@router.post("/separate")
async def separate_stems(
    recording_id: str,
    session_id: str | None = None,
    stem_types: list[str] | None = None,
    save_files: bool = True,
) -> dict:
    """
    Separate audio into stems (vocals, drums, bass, other).
    """
    settings = get_settings()

    samples = None
    sr = 48000

    if session_id:
        from calliope.routes.recordings import _recordings

        if session_id in _recordings:
            session = _recordings[session_id]
            recording = next((f for f in session["files"] if f["id"] == recording_id), None)

            if recording:
                from pathlib import Path

                file_path = Path(recording["path"])
                if file_path.exists():
                    samples, sr = read_audio_file(file_path)
    else:
        from pathlib import Path

        file_path = Path(settings.recordings_path) / recording_id
        if file_path.exists():
            samples, sr = read_audio_file(file_path)

    if samples is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    if stem_types is None:
        stem_types = ["vocals", "drums", "bass", "other"]

    output_dir = str(settings.processed_path / "stems" / recording_id) if save_files else None
    result = separate_audio_stems(samples, sr, stem_types, output_dir)

    return {
        "recording_id": recording_id,
        "stems": {name: path for name, path in result.items()},
        "stem_count": len(result),
    }


@router.post("/extract-vocals")
async def extract_vocals_route(
    recording_id: str,
    session_id: str | None = None,
    save_file: bool = True,
) -> dict:
    """
    Extract vocal track from mixed audio.
    """
    settings = get_settings()

    samples = None
    sr = 48000

    if session_id:
        from calliope.routes.recordings import _recordings

        if session_id in _recordings:
            session = _recordings[session_id]
            recording = next((f for f in session["files"] if f["id"] == recording_id), None)

            if recording:
                from pathlib import Path

                file_path = Path(recording["path"])
                if file_path.exists():
                    samples, sr = read_audio_file(file_path)

    if samples is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    vocals = extract_vocals(samples, sr)

    output_file = None
    if save_file:
        output_path = settings.processed_path / "stems" / recording_id / "vocals.wav"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        write_audio_file(output_path, vocals, sr, format="wav")
        output_file = str(output_path)

    return {
        "recording_id": recording_id,
        "output_file": output_file,
        "duration_sec": len(vocals) / sr if vocals.ndim == 1 else vocals.shape[0] / sr,
    }


@router.post("/melody-bass")
async def separate_melody_bass(
    recording_id: str,
    session_id: str | None = None,
) -> dict:
    """
    Separate audio into melody and bass tracks.
    """
    from calliope.audio.stem_separation import StemSeparator
    from calliope.config import get_settings

    settings = get_settings()

    samples = None
    sr = 48000

    if session_id:
        from calliope.routes.recordings import _recordings

        if session_id in _recordings:
            session = _recordings[session_id]
            recording = next((f for f in session["files"] if f["id"] == recording_id), None)

            if recording:
                from pathlib import Path

                file_path = Path(recording["path"])
                if file_path.exists():
                    samples, sr = read_audio_file(file_path)

    if samples is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    separator = StemSeparator()
    result = separator.separate_melody_bass(samples, sr)

    output_dir = settings.processed_path / "stems" / recording_id
    output_dir.mkdir(parents=True, exist_ok=True)

    file_paths = {}
    for name, audio in result.items():
        output_path = output_dir / f"{name}.wav"
        write_audio_file(output_path, audio, sr, format="wav")
        file_paths[name] = str(output_path)

    return {
        "recording_id": recording_id,
        "stems": file_paths,
    }