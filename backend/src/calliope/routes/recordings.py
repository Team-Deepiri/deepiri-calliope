"""Recording session management and file upload/download routes."""

from __future__ import annotations

import asyncio
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated

import numpy as np
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
    CommitRapTakeRequest,
    CommitRapTakeResponse,
    PluginChainIn,
    VocalRackIn,
)

router = APIRouter(prefix="/v1/recordings", tags=["recordings"])

# In-memory session index; WAV files on disk are the source of truth (see _hydrate_session_from_disk).
_recordings: dict[str, dict] = {}

# Matches frontend VOCAL_PRESETS.dry_rap_punch — spoken/rap chain with tight tuning.
DRY_RAP_RACK = VocalRackIn(
    role="spoken_wordcut",
    breath_air=18,
    chest_body=64,
    presence_bite=58,
    de_esser=68,
    saturation_drive=42,
    width_stereo=28,
    room_send=12,
    delay_throw=10,
    tune_tightness=62,
    formant_shift=48,
    warmth_low=55,
    brilliance_air=32,
    punch_snap=78,
    verb_predelay=15,
    motion_blur=12,
    grit_parallel=48,
)

RAP_STYLE_RACK_TWEAKS: dict[str, dict[str, int]] = {
    "hard_tune": {"tune_tightness": 78, "saturation_drive": 48, "punch_snap": 82},
    "melodic_rap": {"tune_tightness": 62, "saturation_drive": 42, "punch_snap": 78},
    "natural": {"tune_tightness": 48, "saturation_drive": 32, "punch_snap": 68},
}


def _rap_style_autotune_config(style: str):
    from calliope.tune.gravy_autotune import AutotuneConfig, AutotuneMode, ScaleType

    presets = {
        "hard_tune": AutotuneConfig(
            mode=AutotuneMode.HARD,
            scale_type=ScaleType.MINOR,
            root_midi=60,
            strength=0.95,
            speed=0.18,
            formant_correction=True,
        ),
        "melodic_rap": AutotuneConfig(
            mode=AutotuneMode.MELODIC,
            scale_type=ScaleType.MINOR,
            root_midi=60,
            strength=0.88,
            speed=0.45,
            formant_correction=True,
        ),
        "natural": AutotuneConfig(
            mode=AutotuneMode.SOFT,
            scale_type=ScaleType.MINOR,
            root_midi=60,
            strength=0.72,
            speed=0.62,
            formant_correction=True,
        ),
    }
    return presets.get(style, presets["melodic_rap"])


def _rap_style_rack(style: str, override: VocalRackIn | None) -> VocalRackIn:
    base = override or DRY_RAP_RACK
    tweaks = RAP_STYLE_RACK_TWEAKS.get(style, RAP_STYLE_RACK_TWEAKS["melodic_rap"])
    return base.model_copy(update=tweaks)


def _hydrate_session_from_disk(session_id: str, settings: Settings) -> dict | None:
    """Rebuild in-memory session metadata from files on disk (survives API reload)."""
    session_dir = settings.recordings_path / session_id
    if not session_dir.is_dir():
        return None

    files: list[dict] = []
    total_duration = 0.0
    for path in sorted(session_dir.iterdir()):
        if not path.is_file():
            continue
        ext = path.suffix.lstrip(".").lower()
        if ext not in settings.supported_audio_formats:
            continue
        recording_id = path.stem
        duration = 0.0
        try:
            info = get_audio_info(path)
            duration = float(info["duration_sec"])
        except (AudioReadError, OSError, KeyError, TypeError, ValueError):
            # Avoid reading full PCM during hydration — metadata-only scan.
            duration = 0.0

        files.append(
            {
                "id": recording_id,
                "filename": path.name,
                "original_name": path.name,
                "format": ext,
                "path": str(path),
                "duration_sec": duration,
                "track_type": "vocal",
                "uploaded_at": datetime.utcfromtimestamp(path.stat().st_mtime),
            }
        )
        total_duration += duration

    session = {
        "id": session_id,
        "name": f"Session {session_id[:8]}",
        "created_at": datetime.utcfromtimestamp(session_dir.stat().st_ctime),
        "sample_rate": 48_000,
        "channels": 2,
        "status": "active" if files else "initialized",
        "files": files,
        "duration_sec": total_duration,
    }
    _recordings[session_id] = session
    return session


def _get_session(session_id: str) -> dict:
    if session_id in _recordings:
        return _recordings[session_id]
    settings = get_settings()
    session = _hydrate_session_from_disk(session_id, settings)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def write_and_register_session_wav(
    session_id: str,
    audio: np.ndarray,
    sr: int,
    original_name: str,
    track_type: str = "vocal",
) -> dict:
    """Write a WAV into an existing session so Studio can load it as a clip."""
    session = _get_session(session_id)
    settings = get_settings()
    new_id = str(uuid.uuid4())
    filename = f"{new_id}.wav"
    out_path = settings.recordings_path / session_id / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        write_audio_file(out_path, audio, sr, format="wav")
    except (AudioReadError, OSError) as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        info = get_audio_info(out_path)
        duration = float(info["duration_sec"])
        sample_rate = int(info.get("sample_rate", sr))
        channels = int(info.get("channels", 1 if audio.ndim == 1 else audio.shape[-1]))
    except (AudioReadError, OSError, KeyError, TypeError, ValueError):
        duration = float(audio.shape[0] / max(sr, 1))
        sample_rate = sr
        channels = 1 if audio.ndim == 1 else int(audio.shape[-1])

    recording_meta = {
        "id": new_id,
        "filename": filename,
        "original_name": original_name,
        "format": "wav",
        "path": str(out_path),
        "duration_sec": duration,
        "track_type": track_type,
        "uploaded_at": datetime.utcnow(),
        "sample_rate": sample_rate,
        "channels": channels,
    }
    session["files"].append(recording_meta)
    session["duration_sec"] = float(session.get("duration_sec") or 0) + duration
    session["status"] = "active"
    return recording_meta


def _resolve_recording_path(session_id: str, file_id: str) -> Path | None:
    settings = get_settings()
    session = _get_session(session_id)
    recording = next((f for f in session["files"] if f["id"] == file_id), None)
    if recording:
        path = Path(recording["path"])
        if path.is_file():
            return path
    session_dir = settings.recordings_path / session_id
    for ext in settings.supported_audio_formats:
        candidate = session_dir / f"{file_id}.{ext}"
        if candidate.is_file():
            return candidate
    return None


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
    session = _get_session(session_id)
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
    
    session = _get_session(session_id)
    
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
    return _get_session(session_id)["files"]


@router.get("/sessions/{session_id}/files/{file_id}/download")
async def download_recording(
    session_id: str,
    file_id: str,
    format: Annotated[str | None, Query(alias="format")] = None,
) -> FileResponse:
    """Download a recording file, optionally converting format."""
    settings = get_settings()
    file_path = _resolve_recording_path(session_id, file_id)
    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found")

    session = _get_session(session_id)
    recording = next((f for f in session["files"] if f["id"] == file_id), None)
    rec_format = recording["format"] if recording else file_path.suffix.lstrip(".").lower()
    
    if format and format != rec_format:
        settings = get_settings()
        export_path = settings.exports_path / f"{file_id}_export.{format}"
        
        from calliope.audio.io import convert_format
        convert_format(file_path, export_path, format)
        return FileResponse(export_path, media_type=f"audio/{format}")
    
    media = f"audio/{rec_format}"
    return FileResponse(file_path, media_type=media)


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

    file_path = _resolve_recording_path(session_id, recording_id)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Recording not found")

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


@router.post("/sessions/{session_id}/commit-rap-take", response_model=CommitRapTakeResponse)
async def commit_rap_take(session_id: str, body: CommitRapTakeRequest) -> CommitRapTakeResponse:
    """
    Autotune + dry-rap vocal chain on a session recording, then register the result
    as a new take the Studio timeline can play and export.
    """
    return await asyncio.to_thread(_commit_rap_take_sync, session_id, body)


def _commit_rap_take_sync(session_id: str, body: CommitRapTakeRequest) -> CommitRapTakeResponse:
    session = _get_session(session_id)
    file_path = _resolve_recording_path(session_id, body.source_recording_id)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording = next((f for f in session["files"] if f["id"] == body.source_recording_id), None)
    settings = get_settings()
    try:
        samples, sr = read_audio_file(file_path, mono=True)
    except AudioReadError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    style = body.style if body.style in RAP_STYLE_RACK_TWEAKS else "melodic_rap"
    detected_bpm: float | None = None
    bpm_confidence = 0.0
    prefer = float(body.target_bpm) if body.target_bpm else None
    try:
        from calliope.audio.beat_sync import TempoDetector

        bpm_val, bpm_conf = TempoDetector(sr).detect_bpm(samples, prefer_bpm=prefer)
        if bpm_conf > 0.12:
            detected_bpm = round(float(bpm_val), 1)
            bpm_confidence = float(bpm_conf)
    except (ImportError, ValueError, TypeError):
        pass

    # Prefer confident detection; force_target_bpm locks the beat (and stretch) to session tempo.
    if body.force_target_bpm and body.target_bpm:
        applied_bpm = float(body.target_bpm)
    elif detected_bpm is not None and bpm_confidence > 0.25:
        applied_bpm = float(detected_bpm)
        if body.target_bpm and abs(body.target_bpm - detected_bpm) / max(detected_bpm, 1.0) < 0.08:
            applied_bpm = float(body.target_bpm)
    elif body.target_bpm:
        applied_bpm = float(body.target_bpm)
    else:
        applied_bpm = None

    stretched = False
    trimmed_leading_sec = 0.0
    try:
        from calliope.audio.beat_sync import stretch_to_tempo, trim_leading_silence

        if body.trim_leading_silence:
            before = len(samples)
            samples = trim_leading_silence(samples, sr)
            trimmed_leading_sec = round(max(0, before - len(samples)) / max(sr, 1), 3)

        # Stretch only when we trust the source tempo estimate.
        if (
            body.snap_to_tempo
            and detected_bpm is not None
            and bpm_confidence > 0.25
            and applied_bpm is not None
        ):
            samples, stretched = stretch_to_tempo(samples, sr, detected_bpm, applied_bpm)
    except (ImportError, ValueError, TypeError, RuntimeError):
        stretched = False

    # Production autotune when available; voice rack still applies pitch correction if this fails.
    try:
        from calliope.tune.gravy_autotune import auto_tune

        at_cfg = _rap_style_autotune_config(style)
        at_result = auto_tune(samples, sr, at_cfg)
        samples = at_result.corrected_samples
    except (ImportError, RuntimeError, ValueError, TypeError):
        pass

    from calliope.voice.engine import process_voice_unit

    rack = _rap_style_rack(style, body.vocal_rack)
    processed, _report = process_voice_unit(
        samples,
        sr,
        rack,
        demo_hz=None,
        output_stereo=False,
    )
    mono = processed[:, 0] if processed.ndim == 2 else processed

    new_id = str(uuid.uuid4())
    filename = f"{new_id}.wav"
    out_path = settings.recordings_path / session_id / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        write_audio_file(out_path, mono, sr, format="wav")
    except (AudioReadError, OSError) as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        info = get_audio_info(out_path)
        duration = float(info["duration_sec"])
        sample_rate = int(info.get("sample_rate", sr))
        channels = int(info.get("channels", 1))
    except (AudioReadError, OSError, KeyError, TypeError, ValueError):
        duration = float(len(mono) / max(sr, 1))
        sample_rate = sr
        channels = 1

    base_name = Path(
        (recording or {}).get("original_name") or (recording or {}).get("filename") or file_path.name
    ).stem
    recording_meta = {
        "id": new_id,
        "filename": filename,
        "original_name": f"{base_name} (autotuned).wav",
        "format": "wav",
        "path": str(out_path),
        "duration_sec": duration,
        "track_type": (recording or {}).get("track_type", "vocal"),
        "uploaded_at": datetime.utcnow(),
    }
    session["files"].append(recording_meta)
    session["duration_sec"] += duration
    session["status"] = "active"

    return CommitRapTakeResponse(
        recording_id=new_id,
        session_id=session_id,
        filename=filename,
        duration_sec=duration,
        sample_rate=sample_rate,
        channels=channels,
        detected_bpm=detected_bpm,
        bpm_confidence=bpm_confidence,
        style=style,
        applied_bpm=applied_bpm,
        stretched=stretched,
        trimmed_leading_sec=trimmed_leading_sec,
    )


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