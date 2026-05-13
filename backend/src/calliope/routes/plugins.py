"""Plugin hosting and audio processing chain routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from calliope.plugins.base import (
    AudioPlugin,
    PluginCategory,
    get_plugin_registry,
)
from calliope.schemas import (
    PluginChainIn,
    PluginInstanceIn,
    PluginListResponse,
)

router = APIRouter(prefix="/v1/plugins", tags=["plugins"])


@router.get("/list", response_model=PluginListResponse)
async def list_plugins(category: str | None = None) -> PluginListResponse:
    """
    List all available audio plugins.
    Optionally filter by category.
    """
    registry = get_plugin_registry()
    
    from calliope.plugins import filters, dynamics, effects, modulation, distortion, eq
    
    plugins = []
    categories = set()
    
    for name in registry.list_plugins():
        plugin = registry.create(name)
        info = plugin.info
        
        cat = info.category.value
        categories.add(cat)
        
        if category is None or cat == category:
            plugins.append({
                "name": info.name,
                "version": info.version,
                "category": cat,
                "description": info.description,
                "author": info.author,
                "parameters": [
                    {
                        "name": p.name,
                        "min": p.min_value,
                        "max": p.max_value,
                        "default": p.default_value,
                        "unit": p.unit,
                        "description": p.description,
                    }
                    for p in info.parameters
                ],
                "sidechain_enabled": info.sidechain_enabled,
                "realtime_safe": info.realtime_safe,
            })
    
    return PluginListResponse(
        plugins=plugins,
        categories=sorted(list(categories)),
    )


@router.post("/chain/process")
async def process_with_chain(
    samples: list[float],
    sr: int,
    chain: PluginChainIn,
) -> dict:
    """
    Process audio samples through a chain of plugins.
    """
    import numpy as np
    
    y = np.asarray(samples, dtype=np.float64).ravel()
    registry = get_plugin_registry()
    
    for instance in chain.plugins:
        if not instance.enabled:
            continue
        
        try:
            plugin = registry.create(instance.plugin_name, sr)
            
            for param in instance.parameters:
                plugin.set_parameter(param.name, param.value)
            
            if instance.mix < 1.0:
                dry = y.copy()
                y = plugin.process(y)
                y = (1.0 - instance.mix) * dry + instance.mix * y
            else:
                y = plugin.process(y)
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Plugin error: {str(e)}")
    
    return {
        "samples": y.tolist(),
        "sample_rate": sr,
        "length": len(y),
    }


@router.post("/autotune/process")
async def autotune_file(
    recording_id: str,
    session_id: str,
    mode: str = "auto",
    scale_type: str = "major",
    root_midi: int = 60,
    strength: float = 1.0,
    speed: float = 0.5,
    formant_correction: bool = True,
) -> dict:
    """
    Apply production-grade autotune to a recording.
    """
    from pathlib import Path
    from calliope.audio.io import read_audio_file, write_audio_file
    from calliope.config import get_settings
    from calliope.tune.gravy_autotune import auto_tune, AutotuneConfig, AutotuneMode, ScaleType
    from calliope.schemas import RecordingSessionCreate
    
    settings = get_settings()
    
    mode_map = {
        "auto": AutotuneMode.AUTO,
        "hard": AutotuneMode.HARD,
        "soft": AutotuneMode.SOFT,
        "melodic": AutotuneMode.MELODIC,
    }
    
    scale_map = {
        "major": ScaleType.MAJOR,
        "minor": ScaleType.MINOR,
        "harmonic_minor": ScaleType.HARMONIC_MINOR,
        "melodic_minor": ScaleType.MELODIC_MINOR,
        "dorian": ScaleType.DORIAN,
        "mixolydian": ScaleType.MIXOLYDIAN,
        "blues": ScaleType.BLUES,
        "pentatonic_major": ScaleType.PENTATONIC_MAJOR,
        "pentatonic_minor": ScaleType.PENTATONIC_MINOR,
        "chromatic": ScaleType.CHROMATIC,
    }
    
    config = AutotuneConfig(
        mode=mode_map.get(mode, AutotuneMode.AUTO),
        scale_type=scale_map.get(scale_type, ScaleType.MAJOR),
        root_midi=root_midi,
        strength=strength,
        speed=speed,
        formant_correction=formant_correction,
    )
    
    from calliope.routes.recordings import _recordings
    
    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = _recordings[session_id]
    recording = next((f for f in session["files"] if f["id"] == recording_id), None)
    
    if recording is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    file_path = Path(recording["path"])
    samples, sr = read_audio_file(file_path, mono=True)
    
    result = auto_tune(samples, sr, config)
    
    output_path = settings.processed_path / f"{recording_id}_autotuned.wav"
    write_audio_file(output_path, result.corrected_samples, sr, format="wav")
    
    return {
        "recording_id": recording_id,
        "output_file": str(output_path),
        "original_f0": result.original_f0.tolist(),
        "corrected_f0": result.corrected_f0.tolist(),
        "confidence": result.confidence.tolist(),
        "correction_amount_cents": result.correction_amount_cents.tolist(),
    }


@router.get("/info/{plugin_name}")
async def get_plugin_info(plugin_name: str) -> dict:
    """Get detailed information about a specific plugin."""
    registry = get_plugin_registry()
    
    try:
        plugin = registry.create(plugin_name)
        info = plugin.info
        
        return {
            "name": info.name,
            "version": info.version,
            "category": info.category.value,
            "description": info.description,
            "author": info.author,
            "parameters": [
                {
                    "name": p.name,
                    "min": p.min_value,
                    "max": p.max_value,
                    "default": p.default_value,
                    "step": p.step,
                    "unit": p.unit,
                    "description": p.description,
                    "automate": p.automate,
                }
                for p in info.parameters
            ],
            "sidechain_enabled": info.sidechain_enabled,
            "realtime_safe": info.realtime_safe,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))