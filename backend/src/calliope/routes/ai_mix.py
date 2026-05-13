"""AI mix and mastering API routes."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException

from calliope.audio.ai_mix import AIMixEngine, auto_mix, auto_master
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/ai-mix", tags=["ai-mix"])


@router.post("/analyze")
async def analyze_for_mix(
    recording_id: str,
    session_id: str | None = None,
) -> dict:
    """
    Analyze a recording for automatic mixing recommendations.
    """
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

    engine = AIMixEngine(sr)
    analysis = engine.analyze_track_balance(samples)

    recommendations = {
        "needs_level_adjustment": analysis["rms_mono_dbfs"] < -20,
        "needs_stereo_correction": abs(analysis["stereo_correlation"]) < 0.3,
        "needs_brightness": analysis["frequency_balance"]["high_ratio"] < 0.25,
        "needs_low_end": analysis["frequency_balance"]["low_ratio"] < 0.25,
    }

    return {
        "recording_id": recording_id,
        "analysis": analysis,
        "recommendations": recommendations,
    }


@router.post("/auto-mix")
async def auto_mix_recording(
    recording_id: str,
    session_id: str | None = None,
    target_lufs: float = -14.0,
    brightness: float = 0.5,
    warmth: float = 0.3,
    punch: float = 0.5,
    stereo_width: float = 1.0,
) -> dict:
    """
    Apply AI-powered automatic mixing to a recording.
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

    engine = AIMixEngine(sr)
    result = engine.full_auto_mix(
        samples, target_lufs, brightness, warmth, punch, stereo_width
    )

    output_path = settings.processed_path / f"{recording_id}_automix.wav"
    write_audio_file(output_path, result["processed_samples"], sr, format="wav")

    return {
        "recording_id": recording_id,
        "output_file": str(output_path),
        "input_rms_dbfs": result["input_analysis"]["rms_mono_dbfs"],
        "output_rms_dbfs": result["output_analysis"]["rms_mono_dbfs"],
        "dynamic_range_change_db": result["improvements"]["dynamic_range_change_db"],
        "stereo_correlation_change": result["improvements"]["stereo_correlation_change"],
        "settings_used": result["settings_used"],
    }


@router.post("/auto-master")
async def auto_master_recording(
    recording_id: str,
    session_id: str | None = None,
    style: str = "balanced",
) -> dict:
    """
    Apply AI-powered automatic mastering to a recording.
    Styles: loud, balanced, subtle
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

    valid_styles = ["loud", "balanced", "subtle"]
    if style not in valid_styles:
        style = "balanced"

    processed = auto_master(samples, sr, style)

    output_path = settings.processed_path / f"{recording_id}_mastered.wav"
    write_audio_file(output_path, processed, sr, format="wav")

    from calliope.audio.loudness import measure_lufs

    input_lufs = measure_lufs(samples, sr)
    output_lufs = measure_lufs(processed, sr)

    return {
        "recording_id": recording_id,
        "output_file": str(output_path),
        "style": style,
        "input_lufs": input_lufs,
        "output_lufs": output_lufs,
    }


@router.post("/compare")
async def compare_mix_settings(
    recording_id: str,
    session_id: str | None = None,
    presets: list[dict] | None = None,
) -> dict:
    """
    Compare different auto-mix settings on a recording.
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

    if presets is None:
        presets = [
            {"target_lufs": -14, "brightness": 0.5, "warmth": 0.3, "punch": 0.5, "stereo_width": 1.0},
            {"target_lufs": -12, "brightness": 0.7, "warmth": 0.2, "punch": 0.7, "stereo_width": 1.2},
            {"target_lufs": -16, "brightness": 0.4, "warmth": 0.5, "punch": 0.3, "stereo_width": 0.8},
        ]

    engine = AIMixEngine(sr)
    results = []

    for i, preset in enumerate(presets):
        result = engine.full_auto_mix(
            samples,
            preset["target_lufs"],
            preset["brightness"],
            preset["warmth"],
            preset["punch"],
            preset["stereo_width"],
        )

        results.append({
            "preset_index": i,
            "settings": preset,
            "output_rms_dbfs": result["output_analysis"]["rms_mono_dbfs"],
            "dynamic_range_db": result["output_analysis"]["dynamic_range_db"],
            "stereo_correlation": result["output_analysis"]["stereo_correlation"],
        })

    return {
        "recording_id": recording_id,
        "presets_tested": len(presets),
        "results": results,
    }