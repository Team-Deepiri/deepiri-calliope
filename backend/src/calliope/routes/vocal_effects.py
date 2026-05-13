"""Vocal effect presets API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from calliope.voice.vocal_effects import VocalEffectsChain, VocalEffectType, apply_vocal_effect
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/vocal-effects", tags=["vocal-effects"])


class VocalEffectRequest(BaseModel):
    recording_id: str | None = None
    session_id: str | None = None
    file_path: str | None = None
    samples: list[float] | None = None
    sample_rate: int = 48000
    effect_type: str
    dry_wet: float = 1.0


class VocalEffectResponse(BaseModel):
    output_file: str | None = None
    samples: list[float] | None = None
    duration_sec: float
    effect_type: str


@router.get("/presets")
async def list_vocal_effect_presets() -> dict:
    """
    List all available vocal effect presets.
    """
    chain = VocalEffectsChain()
    presets = chain.list_presets()
    
    return {
        "presets": presets,
        "categories": list(set(tag for p in presets for tag in p["tags"])),
    }


@router.get("/presets/{effect_type}")
async def get_vocal_effect_preset(effect_type: str) -> dict:
    """
    Get details for a specific vocal effect preset.
    """
    chain = VocalEffectsChain()
    
    try:
        effect = VocalEffectType(effect_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown effect type: {effect_type}")
    
    preset = chain.get_preset(effect)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    return {
        "type": preset.effect_type.value,
        "name": preset.name,
        "description": preset.description,
        "tags": preset.tags,
        "plugins": [
            {
                "name": name,
                "parameters": [{"name": p.name, "value": p.value, "min": p.range_min, "max": p.range_max} for p in params],
            }
            for name, params in preset.plugins
        ],
    }


@router.post("/apply")
async def apply_vocal_effect_route(body: VocalEffectRequest) -> VocalEffectResponse:
    """
    Apply a vocal effect to audio.
    Can process from recording, file path, or direct samples.
    """
    settings = get_settings()
    
    samples = None
    sr = body.sample_rate
    
    if body.recording_id and body.session_id:
        from calliope.routes.recordings import _recordings
        
        if body.session_id in _recordings:
            session = _recordings[body.session_id]
            recording = next((f for f in session["files"] if f["id"] == body.recording_id), None)
            
            if recording:
                from pathlib import Path
                file_path = Path(recording["path"])
                samples, sr = read_audio_file(file_path, mono=True)
    
    elif body.file_path:
        from pathlib import Path
        file_path = Path(body.file_path)
        if file_path.exists():
            samples, sr = read_audio_file(file_path, mono=True)
    
    elif body.samples:
        import numpy as np
        samples = np.asarray(body.samples, dtype=np.float64)
    
    else:
        raise HTTPException(status_code=400, detail="No audio source provided")
    
    if samples is None:
        raise HTTPException(status_code=404, detail="Audio not found")
    
    processed = apply_vocal_effect(samples, body.effect_type, sr, body.dry_wet)
    
    output_file = None
    output_samples = None
    
    if body.recording_id and body.session_id:
        output_filename = f"{body.recording_id}_{body.effect_type}.wav"
        output_path = settings.processed_path / output_filename
        write_audio_file(output_path, processed, sr, format="wav")
        output_file = str(output_path)
    else:
        output_samples = processed.tolist()
    
    return VocalEffectResponse(
        output_file=output_file,
        samples=output_samples,
        duration_sec=len(processed) / sr,
        effect_type=body.effect_type,
    )


@router.post("/preview")
async def preview_vocal_effect(
    samples: list[float],
    effect_type: str,
    sample_rate: int = 48000,
    dry_wet: float = 1.0,
) -> dict:
    """
    Preview a vocal effect without saving - returns processed samples.
    """
    import numpy as np
    
    audio = np.asarray(samples, dtype=np.float64)
    processed = apply_vocal_effect(audio, effect_type, sample_rate, dry_wet)
    
    return {
        "samples": processed.tolist(),
        "sample_rate": sample_rate,
        "duration_sec": len(processed) / sample_rate,
        "effect_type": effect_type,
    }


@router.post("/batch")
async def batch_apply_effects(
    recordings: list[dict],
    effect_type: str,
    dry_wet: float = 1.0,
) -> dict:
    """
    Apply the same effect to multiple recordings.
    """
    from calliope.routes.recordings import _recordings
    from calliope.config import get_settings
    
    settings = get_settings()
    results = []
    
    for rec in recordings:
        session_id = rec.get("session_id")
        recording_id = rec.get("recording_id")
        
        if not session_id or not recording_id:
            results.append({"error": "Missing session_id or recording_id", "recording_id": recording_id})
            continue
        
        if session_id in _recordings:
            session = _recordings[session_id]
            recording = next((f for f in session["files"] if f["id"] == recording_id), None)
            
            if recording:
                from pathlib import Path
                file_path = Path(recording["path"])
                
                if file_path.exists():
                    try:
                        samples, sr = read_audio_file(file_path, mono=True)
                        processed = apply_vocal_effect(samples, effect_type, sr, dry_wet)
                        
                        output_filename = f"{recording_id}_{effect_type}.wav"
                        output_path = settings.processed_path / output_filename
                        write_audio_file(output_path, processed, sr, format="wav")
                        
                        results.append({
                            "recording_id": recording_id,
                            "output_file": str(output_path),
                            "status": "success",
                        })
                    except Exception as e:
                        results.append({"recording_id": recording_id, "error": str(e), "status": "failed"})
            else:
                results.append({"recording_id": recording_id, "error": "Recording not found", "status": "failed"})
        else:
            results.append({"recording_id": recording_id, "error": "Session not found", "status": "failed"})
    
    return {
        "effect_type": effect_type,
        "total": len(recordings),
        "results": results,
    }


@router.post("/compare")
async def compare_effects(
    samples: list[float],
    sample_rate: int = 48000,
    effects: list[str] | None = None,
    dry_wet: float = 1.0,
) -> dict:
    """
    Compare multiple effects on the same audio.
    """
    import numpy as np
    
    audio = np.asarray(samples, dtype=np.float64)
    
    if effects is None:
        effects = ["telephone", "robot", "space", "dream", "chorus"]
    
    results = {}
    
    for effect in effects:
        try:
            processed = apply_vocal_effect(audio, effect, sample_rate, dry_wet)
            
            rms_in = float(np.sqrt(np.mean(audio ** 2)))
            rms_out = float(np.sqrt(np.mean(processed ** 2)))
            
            peak_in = float(np.max(np.abs(audio)))
            peak_out = float(np.max(np.abs(processed)))
            
            results[effect] = {
                "rms_in_dbfs": 20 * np.log10(rms_in + 1e-10),
                "rms_out_dbfs": 20 * np.log10(rms_out + 1e-10),
                "peak_in_dbfs": 20 * np.log10(peak_in + 1e-10),
                "peak_out_dbfs": 20 * np.log10(peak_out + 1e-10),
                "dynamic_range": 20 * np.log10(peak_out / (rms_out + 1e-10)),
            }
        except Exception as e:
            results[effect] = {"error": str(e)}
    
    return {
        "effects": results,
        "sample_rate": sample_rate,
    }