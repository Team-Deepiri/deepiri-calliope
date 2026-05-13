"""Audio clip upload and management for music customization."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from calliope.config import get_settings

router = APIRouter(prefix="/v1/music", tags=["music"])


_audio_clips: dict[str, dict] = {}


@router.post("/clips/upload")
async def upload_audio_clip(
    file: Annotated[UploadFile, File(description="Audio file to upload as reference")],
    name: Annotated[str | None, Form()] = None,
    category: Annotated[str, Form()] = "reference",
    description: Annotated[str | None, Form()] = None,
) -> dict:
    """
    Upload an audio clip for use in music generation customization.
    Categories: reference, sample, loop, stem, instrumental, vocal
    """
    settings = get_settings()
    
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
    
    clip_id = str(uuid.uuid4())
    filename = f"{clip_id}.{ext}"
    clips_dir = settings.data_path / "audio_clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    file_path = clips_dir / filename
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        from calliope.audio.io import get_audio_info
        info = get_audio_info(file_path)
        duration = info["duration_sec"]
        sample_rate = info.get("sample_rate", 48000)
        channels = info.get("channels", 2)
    except Exception:
        duration = 0.0
        sample_rate = 48000
        channels = 2
    
    clip_meta = {
        "id": clip_id,
        "name": name or file.filename or "Untitled",
        "filename": filename,
        "original_name": file.filename or "unknown",
        "category": category,
        "description": description or "",
        "path": str(file_path),
        "duration_sec": duration,
        "sample_rate": sample_rate,
        "channels": channels,
        "format": ext,
    }
    
    _audio_clips[clip_id] = clip_meta
    
    return {
        "clip_id": clip_id,
        "name": clip_meta["name"],
        "filename": filename,
        "category": category,
        "duration_sec": duration,
        "sample_rate": sample_rate,
        "channels": channels,
    }


@router.get("/clips")
async def list_audio_clips(
    category: str | None = None,
    search: str | None = None,
) -> dict:
    """
    List all uploaded audio clips.
    """
    results = list(_audio_clips.values())
    
    if category:
        results = [c for c in results if c["category"] == category]
    
    if search:
        search_lower = search.lower()
        results = [
            c for c in results
            if search_lower in c["name"].lower() or search_lower in c["description"].lower()
        ]
    
    return {
        "clips": [
            {
                "id": c["id"],
                "name": c["name"],
                "category": c["category"],
                "description": c["description"],
                "duration_sec": c["duration_sec"],
                "sample_rate": c["sample_rate"],
                "channels": c["channels"],
                "format": c["format"],
            }
            for c in results
        ],
        "total": len(results),
    }


@router.get("/clips/{clip_id}")
async def get_audio_clip(clip_id: str) -> dict:
    """Get metadata for a specific audio clip."""
    if clip_id not in _audio_clips:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    clip = _audio_clips[clip_id]
    return {
        "id": clip["id"],
        "name": clip["name"],
        "category": clip["category"],
        "description": clip["description"],
        "duration_sec": clip["duration_sec"],
        "sample_rate": clip["sample_rate"],
        "channels": clip["channels"],
        "format": clip["format"],
    }


@router.delete("/clips/{clip_id}")
async def delete_audio_clip(clip_id: str) -> dict:
    """Delete an audio clip."""
    if clip_id not in _audio_clips:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    clip = _audio_clips[clip_id]
    file_path = Path(clip["path"])
    
    if file_path.exists():
        file_path.unlink()
    
    del _audio_clips[clip_id]
    
    return {"status": "deleted", "clip_id": clip_id}


@router.post("/clips/{clip_id}/analyze")
async def analyze_audio_clip(clip_id: str) -> dict:
    """
    Analyze an audio clip to extract musical characteristics.
    Used for style matching in generation.
    """
    if clip_id not in _audio_clips:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    clip = _audio_clips[clip_id]
    file_path = Path(clip["path"])
    
    try:
        from calliope.audio.io import read_audio_file
        from calliope.audio.quantize import detect_tempo
        
        samples, sr = read_audio_file(file_path)
        
        if samples.ndim > 1:
            samples = (samples[:, 0] + samples[:, 1]) / 2
        
        tempo, confidence = detect_tempo(samples, sr)
        
        from calliope.audio.spectrum import compute_spectrum_stats
        spectral = compute_spectrum_stats(samples, sr)
        
        rms = float(np.sqrt(np.mean(samples ** 2)))
        rms_db = 20 * np.log10(max(rms, 1e-10))
        
        peak = float(np.max(np.abs(samples)))
        peak_db = 20 * np.log10(max(peak, 1e-10))
        
        return {
            "clip_id": clip_id,
            "tempo_bpm": tempo,
            "tempo_confidence": confidence,
            "duration_sec": clip["duration_sec"],
            "rms_dbfs": rms_db,
            "peak_dbfs": peak_db,
            "spectral_centroid": spectral.get("centroid_hz", 0),
            "spectral_rolloff": spectral.get("rolloff_hz", 0),
            "spectral_flatness": spectral.get("flatness", 0),
            "zero_crossing_rate": spectral.get("zcr", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/clips/{clip_id}/extract")
async def extract_audio_features(
    clip_id: str,
    feature_type: str = "melody",
) -> dict:
    """
    Extract specific features from an audio clip.
    Types: melody, rhythm, harmony, timbre
    """
    import numpy as np
    
    if clip_id not in _audio_clips:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    clip = _audio_clips[clip_id]
    file_path = Path(clip["path"])
    
    try:
        from calliope.audio.io import read_audio_file
        
        samples, sr = read_audio_file(file_path)
        
        if samples.ndim > 1:
            samples = (samples[:, 0] + samples[:, 1]) / 2
        
        if feature_type == "melody":
            from calliope.tune.gravy_autotune import detect_pitch_crepe
            
            f0_data, confidence = detect_pitch_crepe(samples, sr)
            
            valid_mask = confidence > 0.5
            f0_valid = f0_data[valid_mask]
            
            if len(f0_valid) > 0:
                midi_notes = 69 + 12 * np.log2(f0_valid / 440)
                note_hist = np.zeros(12)
                for n in midi_notes:
                    note_hist[int(n % 12)] += 1
                
                key_profile = note_hist / max(note_hist.sum(), 1)
                
                return {
                    "feature_type": "melody",
                    "clip_id": clip_id,
                    "f0_data": f0_data.tolist(),
                    "confidence": confidence.tolist(),
                    "key": str(np.argmax(note_hist)),
                    "key_confidence": float(note_hist.max()),
                    "note_histogram": note_hist.tolist(),
                    "duration_sec": clip["duration_sec"],
                }
            return {"feature_type": "melody", "clip_id": clip_id, "f0_data": [], "confidence": []}
        
        elif feature_type == "rhythm":
            from calliope.audio.quantize import detect_tempo
            
            tempo, conf = detect_tempo(samples, sr)
            
            energy = np.abs(samples)
            onset_env = np.diff(energy)
            onset_env = np.concatenate([[0], np.maximum(onset_env, 0)])
            
            return {
                "feature_type": "rhythm",
                "clip_id": clip_id,
                "tempo_bpm": tempo,
                "tempo_confidence": conf,
                "onset_envelope": onset_env.tolist()[::100],
                "energy_rms": float(np.sqrt(np.mean(energy ** 2))),
            }
        
        elif feature_type == "timbre":
            from calliope.audio.spectrum import compute_spectrum_stats
            
            spectral = compute_spectrum_stats(samples, sr)
            
            return {
                "feature_type": "timbre",
                "clip_id": clip_id,
                "spectral_centroid": spectral.get("centroid_hz", 0),
                "spectral_bandwidth": spectral.get("bandwidth_hz", 0),
                "spectral_rolloff": spectral.get("rolloff_hz", 0),
                "spectral_flatness": spectral.get("flatness", 0),
                "brightness": spectral.get("brightness", 0),
                "warmth": spectral.get("warmth", 0),
            }
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown feature type: {feature_type}")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")