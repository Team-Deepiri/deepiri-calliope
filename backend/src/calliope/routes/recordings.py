"""Recording session management and file upload/download routes."""

from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from calliope.audio.io import (
    AudioReadError,
    get_audio_info,
    read_audio_file,
    write_audio_file,
)
from calliope.config import Settings, get_settings
from calliope.schemas import (
    RecordingSessionCreate,
    RecordingSessionOut,
    RecordingUploadResponse,
    RecordingProcessRequest,
    RecordingProcessResponse,
    PluginChainIn,
)

router = APIRouter(prefix="/v1/recordings", tags=["recordings"])

_recordings: dict[str, dict] = {}


@router.post("/sessions", response_model=RecordingSessionOut)
async def create_session(body: RecordingSessionCreate) -> RecordingSessionOut:
    """Create a new recording session."""
    session_id = str(uuid.uuid4())
    settings = get_settings()
    
    session_dir = settings.recordings_path / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    session = {
        "id": session_id,
        "name": body.name,
        "created_at": datetime.utcnow(),
        "sample_rate": body.sample_rate,
        "channels": body.channels,
        "status": "initialized",
        "files": [],
        "duration_sec": 0.0,
    }
    _recordings[session_id] = session

    return RecordingSessionOut(
        id=session_id,
        name=body.name,
        created_at=session["created_at"],
        sample_rate=body.sample_rate,
        channels=body.channels,
        status="initialized",
        file_count=0,
        duration_sec=0.0,
    )


@router.get("/sessions/{session_id}", response_model=RecordingSessionOut)
async def get_session(session_id: str) -> RecordingSessionOut:
    """Get recording session details."""
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _recordings[session_id]
    return RecordingSessionOut(
        id=session["id"],
        name=session["name"],
        created_at=session["created_at"],
        sample_rate=session["sample_rate"],
        channels=session["channels"],
        status=session["status"],
        file_count=len(session["files"]),
        duration_sec=session["duration_sec"],
    )


@router.post("/sessions/{session_id}/upload", response_model=RecordingUploadResponse)
async def upload_recording(
    session_id: str,
    file: Annotated[UploadFile, File(description="Audio file to upload")],
    name: Annotated[str | None, Form()] = None,
    track_type: Annotated[str, Form()] = "vocal",
) -> RecordingUploadResponse:
    """
    Upload audio file to a recording session.
    Supports WAV, MP3, OGG, FLAC, M4A, AAC formats.
    """
    settings = get_settings()
    
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _recordings[session_id]
    
    ext = Path(file.filename).suffix.lstrip(".").lower()
    if ext not in settings.supported_audio_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Supported: {settings.supported_audio_formats}",
        )
    
    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max: {settings.max_upload_size_mb}MB",
        )
    
    recording_id = str(uuid.uuid4())
    filename = f"{recording_id}.{ext}"
    file_path = settings.recordings_path / session_id / filename
    
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        info = get_audio_info(file_path)
        duration = float(info["duration_sec"])
        sample_rate = int(info.get("sample_rate", session["sample_rate"]))
        channels = int(info.get("channels", session["channels"]))
    except Exception:
        info = {}
        duration = 0.0
        sample_rate = session["sample_rate"]
        channels = session["channels"]
        # Fallback duration from WAV header / raw size when soundfile fails
        try:
            samples, sr = read_audio_file(file_path, mono=True)
            duration = float(len(samples) / max(sr, 1))
            sample_rate = sr
            channels = 1
        except Exception:
            pass
    
    recording_meta = {
        "id": recording_id,
        "filename": filename,
        "original_name": file.filename or "unknown",
        "format": ext,
        "path": str(file_path),
        "duration_sec": duration,
        "track_type": track_type,
        "uploaded_at": datetime.utcnow(),
    }
    
    session["files"].append(recording_meta)
    session["duration_sec"] += duration
    session["status"] = "active"
    
    return RecordingUploadResponse(
        recording_id=recording_id,
        session_id=session_id,
        filename=filename,
        duration_sec=duration,
        sample_rate=sample_rate,
        channels=channels,
    )


@router.get("/sessions/{session_id}/files")
async def list_session_files(session_id: str) -> list[dict]:
    """List all files in a recording session."""
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return _recordings[session_id]["files"]


@router.get("/sessions/{session_id}/files/{file_id}/download")
async def download_recording(
    session_id: str,
    file_id: str,
    format: Annotated[str | None, Query(alias="format")] = None,
) -> FileResponse:
    """Download a recording file, optionally converting format."""
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _recordings[session_id]
    recording = next((f for f in session["files"] if f["id"] == file_id), None)
    
    if recording is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = Path(recording["path"])
    
    if format and format != recording["format"]:
        settings = get_settings()
        export_path = settings.exports_path / f"{file_id}_export.{format}"
        
        from calliope.audio.io import convert_format
        convert_format(file_path, export_path, format)
        return FileResponse(export_path, media_type=f"audio/{format}")
    
    return FileResponse(file_path, media_type=f"audio/{recording['format']}")


@router.get("/enhanced/{file_id}.wav")
async def download_enhanced(file_id: str) -> FileResponse:
    """Serve AI-enhanced vocal files."""
    settings = get_settings()
    file_path = settings.recordings_path / "enhanced" / f"{file_id}.wav"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Enhanced file not found")
    return FileResponse(file_path, media_type="audio/wav")


@router.post("/process", response_model=RecordingProcessResponse)
async def process_recording(body: RecordingProcessRequest) -> RecordingProcessResponse:
    """
    Process a recording with the full vocal chain and optional plugins.
    """
    settings = get_settings()
    
    recording_id = body.recording_id
    session_id = body.session_id
    
    if session_id in _recordings:
        session = _recordings[session_id]
        recording = next((f for f in session["files"] if f["id"] == recording_id), None)
        
        if recording:
            file_path = Path(recording["path"])
            try:
                samples, sr = read_audio_file(file_path)
                
                from calliope.voice.engine import process_voice_unit
                from calliope.schemas import VocalRackIn
                
                rack = body.vocal_rack or VocalRackIn()
                processed, report = process_voice_unit(samples, sr, rack)
                
                if processed.ndim == 2:
                    left = processed[:, 0]
                    right = processed[:, 1]
                else:
                    left = right = processed
                
                output_filename = f"{recording_id}_processed.wav"
                output_path = settings.processed_path / output_filename
                
                write_audio_file(
                    output_path,
                    processed.T if processed.ndim == 2 else processed,
                    sr,
                    format="wav",
                )
                
                return RecordingProcessResponse(
                    recording_id=recording_id,
                    output_file=output_filename,
                    duration_sec=len(left) / sr,
                    sample_rate=sr,
                    metrics={
                        "rms_in_dbfs": report.rms_in_dbfs,
                        "rms_out_dbfs": report.rms_out_dbfs,
                        "peak_in": report.peak_in,
                        "peak_out": report.peak_out,
                        "bypassed": report.bypassed,
                    },
                )
            except AudioReadError as e:
                raise HTTPException(status_code=500, detail=str(e))
    
    raise HTTPException(status_code=404, detail="Recording not found")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict:
    """Delete a recording session and all its files."""
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    settings = get_settings()
    session_dir = settings.recordings_path / session_id
    
    if session_dir.exists():
        shutil.rmtree(session_dir)
    
    del _recordings[session_id]
    
    return {"status": "deleted", "session_id": session_id}


@router.delete("/sessions/{session_id}/files/{file_id}")
async def delete_file(session_id: str, file_id: str) -> dict:
    """Delete a specific file from a session."""
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _recordings[session_id]
    recording = next((f for f in session["files"] if f["id"] == file_id), None)
    
    if recording is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = Path(recording["path"])
    if file_path.exists():
        file_path.unlink()
    
    session["files"] = [f for f in session["files"] if f["id"] != file_id]
    
    return {"status": "deleted", "file_id": file_id}