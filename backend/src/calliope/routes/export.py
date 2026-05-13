"""Audio export presets API routes."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException

from calliope.audio.export_presets import ExportPresetManager, export_with_preset, ExportPreset
from calliope.audio.io import read_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/export", tags=["export"])


@router.get("/presets")
async def list_export_presets() -> dict:
    """
    List all available export presets.
    """
    presets = ExportPresetManager.list_presets()
    return {"presets": presets}


@router.get("/presets/{preset_name}")
async def get_export_preset(preset_name: str) -> dict:
    """
    Get details for a specific export preset.
    """
    try:
        preset = ExportPreset(preset_name)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown preset: {preset_name}")

    config = ExportPresetManager.get_preset(preset)

    return {
        "type": preset.value,
        "format": config.format,
        "sample_rate": config.sample_rate,
        "bit_depth": config.bit_depth,
        "channels": config.channels,
        "bitrate": config.bitrate,
        "loudness_target": config.loudness_target,
        "peak_ceiling": config.peak_ceiling,
    }


@router.post("/apply-preset")
async def apply_export_preset(
    recording_id: str,
    session_id: str | None = None,
    preset_type: str = "spotify",
    output_filename: str | None = None,
) -> dict:
    """
    Apply an export preset to a recording and save the result.
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

    if output_filename is None:
        output_filename = f"{recording_id}_{preset_type}"

    output_dir = settings.exports_path
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        preset = ExportPreset(preset_type)
    except ValueError:
        preset = ExportPreset.SPOTIFY

    config = ExportPresetManager.get_preset(preset)
    output_path = output_dir / f"{output_filename}.{config.format}"

    result = export_with_preset(samples, sr, str(output_path), preset_type)

    return {
        "output_file": result["output_file"],
        "preset": result["preset"],
        "format": result["format"],
        "sample_rate": result["sample_rate"],
        "duration_sec": result["duration_sec"],
        "size_bytes": output_path.stat().st_size if output_path.exists() else 0,
    }


@router.post("/batch-export")
async def batch_export_presets(
    recording_ids: list[str],
    session_id: str | None = None,
    preset_type: str = "spotify",
    output_format: str | None = None,
) -> dict:
    """
    Export multiple recordings with the same preset.
    """
    settings = get_settings()

    try:
        preset = ExportPreset(preset_type)
    except ValueError:
        preset = ExportPreset.SPOTIFY

    config = ExportPresetManager.get_preset(preset)
    output_dir = settings.exports_path / preset_type
    output_dir.mkdir(parents=True, exist_ok=True)

    results = []

    for recording_id in recording_ids:
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

        if samples is not None:
            try:
                format_ext = output_format or config.format
                output_path = output_dir / f"{recording_id}.{format_ext}"

                result = export_with_preset(samples, sr, str(output_path), preset_type)

                results.append({
                    "recording_id": recording_id,
                    "status": "success",
                    "output_file": result["output_file"],
                    "format": result["format"],
                    "duration_sec": result["duration_sec"],
                })
            except Exception as e:
                results.append({
                    "recording_id": recording_id,
                    "status": "failed",
                    "error": str(e),
                })
        else:
            results.append({
                "recording_id": recording_id,
                "status": "failed",
                "error": "Recording not found",
            })

    return {
        "preset": preset.value,
        "total": len(recording_ids),
        "successful": sum(1 for r in results if r["status"] == "success"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "results": results,
    }


@router.post("/normalize")
async def normalize_audio(
    recording_id: str,
    session_id: str | None = None,
    target_lufs: float = -14.0,
    peak_ceiling: float = -1.0,
) -> dict:
    """
    Normalize audio to specific loudness and peak levels.
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

    from calliope.audio.loudness import loudness_normalize

    normalized = loudness_normalize(samples, target_lufs)

    peak_linear = 10 ** (peak_ceiling / 20)
    current_peak = np.max(np.abs(normalized))
    if current_peak > peak_linear:
        normalized = normalized * (peak_linear / current_peak)

    output_path = settings.processed_path / f"{recording_id}_normalized.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    from calliope.audio.io import write_audio_file
    write_audio_file(output_path, normalized, sr, format="wav")

    return {
        "output_file": str(output_path),
        "target_lufs": target_lufs,
        "peak_ceiling": peak_ceiling,
        "duration_sec": len(normalized) / sr,
    }


@router.get("/compare")
async def compare_export_formats(
    recording_id: str,
    session_id: str | None = None,
) -> dict:
    """
    Compare different export formats for a recording.
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

    import numpy as np

    results = {}
    for preset in ExportPreset:
        try:
            config = ExportPresetManager.get_preset(preset)
            processed = ExportPresetManager.apply_preset(samples.copy(), sr, preset)

            output_path = settings.data_path / "export_compare" / f"{recording_id}_{preset.value}.tmp"
            output_path.parent.mkdir(parents=True, exist_ok=True)

            from calliope.audio.io import write_audio_file
            write_audio_file(output_path, processed, config.sample_rate, format=config.format)

            results[preset.value] = {
                "format": config.format,
                "sample_rate": config.sample_rate,
                "bit_depth": config.bit_depth,
                "size_bytes": output_path.stat().st_size if output_path.exists() else 0,
                "estimated_duration": len(processed) / config.sample_rate,
            }

            if output_path.exists():
                output_path.unlink()
        except Exception as e:
            results[preset.value] = {"error": str(e)}

    return {
        "recording_id": recording_id,
        "comparisons": results,
    }