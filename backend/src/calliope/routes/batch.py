"""Batch processing API for handling multiple audio files."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/batch", tags=["batch"])


class BatchProcessItem(BaseModel):
    recording_id: str
    session_id: str | None = None
    vocal_rack: dict | None = None
    plugins: list[dict] | None = None
    autotune: dict | None = None
    effects: list[str] | None = None


class BatchProcessRequest(BaseModel):
    items: list[BatchProcessItem]
    parallel: bool = True
    max_concurrent: int = 4


class BatchProcessResponse(BaseModel):
    total: int
    successful: int
    failed: int
    results: list[dict]


@router.post("/process")
async def batch_process(request: BatchProcessRequest) -> BatchProcessResponse:
    """
    Process multiple recordings in batch.
    Each item can have different processing options.
    """
    settings = get_settings()
    results = []
    successful = 0
    failed = 0

    for item in request.items:
        try:
            from calliope.routes.recordings import _recordings

            samples = None
            sr = 48000

            if item.session_id and item.session_id in _recordings:
                session = _recordings[item.session_id]
                recording = next(
                    (f for f in session["files"] if f["id"] == item.recording_id), None
                )

                if recording:
                    from pathlib import Path

                    file_path = Path(recording["path"])
                    if file_path.exists():
                        samples, sr = read_audio_file(file_path)

            if samples is None:
                results.append({
                    "recording_id": item.recording_id,
                    "status": "failed",
                    "error": "Recording not found",
                })
                failed += 1
                continue

            output_files = []

            if item.vocal_rack:
                from calliope.voice.engine import process_voice_unit

                processed, report = process_voice_unit(
                    samples, sr, item.vocal_rack
                )

                output_path = settings.processed_path / f"{item.recording_id}_vocal.wav"
                write_audio_file(output_path, processed, sr, format="wav")
                output_files.append(str(output_path))

            if item.plugins:
                from calliope.plugins.base import get_plugin_registry

                registry = get_plugin_registry()
                processed = samples.copy()

                for plugin_config in item.plugins:
                    try:
                        plugin = registry.create(plugin_config["plugin_name"], sr)
                        for param_name, param_value in plugin_config.get("parameters", {}).items():
                            plugin.set_parameter(param_name, param_value)
                        processed = plugin.process(processed)
                    except Exception:
                        pass

                output_path = settings.processed_path / f"{item.recording_id}_plugins.wav"
                write_audio_file(output_path, processed, sr, format="wav")
                output_files.append(str(output_path))

            if item.effects:
                from calliope.voice.vocal_effects import apply_vocal_effect

                for effect_type in item.effects:
                    processed = apply_vocal_effect(samples, effect_type, sr, dry_wet=1.0)
                    output_path = settings.processed_path / f"{item.recording_id}_{effect_type}.wav"
                    write_audio_file(output_path, processed, sr, format="wav")
                    output_files.append(str(output_path))

            results.append({
                "recording_id": item.recording_id,
                "status": "success",
                "output_files": output_files,
            })
            successful += 1

        except Exception as e:
            results.append({
                "recording_id": item.recording_id,
                "status": "failed",
                "error": str(e),
            })
            failed += 1

    return BatchProcessResponse(
        total=len(request.items),
        successful=successful,
        failed=failed,
        results=results,
    )


@router.post("/apply-preset")
async def batch_apply_preset(
    recording_ids: list[str],
    session_id: str | None = None,
    preset_id: str | None = None,
    preset_name: str | None = None,
) -> dict:
    """
    Apply a preset to multiple recordings.
    """
    settings = get_settings()

    from calliope.routes.recordings import _recordings
    from calliope.plugins.presets import get_preset_manager

    preset = None
    if preset_id:
        manager = get_preset_manager()
        preset = manager.get_preset(preset_id)
    elif preset_name:
        manager = get_preset_manager()
        presets = manager.list_presets(search=preset_name)
        if presets:
            preset = presets[0]

    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    results = []

    for recording_id in recording_ids:
        try:
            samples = None
            sr = 48000

            if session_id and session_id in _recordings:
                session = _recordings[session_id]
                recording = next(
                    (f for f in session["files"] if f["id"] == recording_id), None
                )

                if recording:
                    from pathlib import Path

                    file_path = Path(recording["path"])
                    if file_path.exists():
                        samples, sr = read_audio_file(file_path)

            if samples is None:
                results.append({
                    "recording_id": recording_id,
                    "status": "failed",
                    "error": "Recording not found",
                })
                continue

            from calliope.plugins.base import get_plugin_registry

            registry = get_plugin_registry()
            processed = samples.copy()

            for plugin_instance in preset.plugins:
                try:
                    plugin = registry.create(plugin_instance.plugin_name, sr)

                    for param in plugin_instance.parameters:
                        plugin.set_parameter(param.name, param.value)

                    if plugin_instance.mix < 1.0:
                        dry = processed.copy()
                        processed = plugin.process(processed)
                        processed = (1 - plugin_instance.mix) * dry + plugin_instance.mix * processed
                    else:
                        processed = plugin.process(processed)
                except Exception:
                    pass

            output_path = settings.processed_path / f"{recording_id}_preset_{preset.id}.wav"
            write_audio_file(output_path, processed, sr, format="wav")

            results.append({
                "recording_id": recording_id,
                "status": "success",
                "output_file": str(output_path),
                "preset_name": preset.name,
            })

        except Exception as e:
            results.append({
                "recording_id": recording_id,
                "status": "failed",
                "error": str(e),
            })

    return {
        "total": len(recording_ids),
        "successful": sum(1 for r in results if r["status"] == "success"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "preset_name": preset.name,
        "results": results,
    }


@router.post("/export-mixdown")
async def batch_export_mixdown(
    recording_ids: list[str],
    session_id: str,
    output_name: str = "mixdown",
    normalize: bool = True,
) -> dict:
    """
    Mix down multiple recordings to a single stereo file.
    """
    settings = get_settings()

    from calliope.routes.recordings import _recordings

    samples_list = []
    sr = 48000

    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _recordings[session_id]

    for recording_id in recording_ids:
        recording = next((f for f in session["files"] if f["id"] == recording_id), None)

        if recording:
            from pathlib import Path

            file_path = Path(recording["path"])
            if file_path.exists():
                samples, sr = read_audio_file(file_path, mono=False)
                samples_list.append((recording_id, samples))

    if not samples_list:
        raise HTTPException(status_code=400, detail="No recordings found")

    if samples_list[0][1].ndim == 2:
        mixed = sum(s for _, s in samples_list)
    else:
        mixed = sum(s for _, s in samples_list)
        mixed = np.stack([mixed, mixed], axis=1)

    if normalize:
        peak = np.max(np.abs(mixed))
        if peak > 0:
            mixed = mixed / peak * 0.95

    output_path = settings.processed_path / f"{output_name}.wav"
    write_audio_file(output_path, mixed, sr, format="wav")

    return {
        "output_file": str(output_path),
        "recording_count": len(samples_list),
        "duration_sec": mixed.shape[0] / sr,
    }


@router.post("/convert-format")
async def batch_convert_format(
    recording_ids: list[str],
    session_id: str,
    output_format: Literal["wav", "mp3", "ogg", "flac"] = "wav",
    bit_depth: int = 16,
    sample_rate: int = 48000,
) -> dict:
    """
    Convert multiple recordings to a different format.
    """
    settings = get_settings()

    from calliope.routes.recordings import _recordings

    results = []

    if session_id not in _recordings:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _recordings[session_id]

    for recording_id in recording_ids:
        recording = next((f for f in session["files"] if f["id"] == recording_id), None)

        if recording:
            from pathlib import Path

            file_path = Path(recording["path"])
            if file_path.exists():
                try:
                    samples, sr = read_audio_file(file_path)

                    if sample_rate != sr:
                        from scipy.signal import resample_poly

                        ratio = sample_rate / sr
                        new_len = int(len(samples) * ratio)
                        samples = resample_poly(samples, int(ratio * 1000), 1000)[:new_len]

                    output_path = settings.exports_path / f"{recording_id}.{output_format}"
                    output_path.parent.mkdir(parents=True, exist_ok=True)

                    write_audio_file(output_path, samples, sample_rate, format=output_format)

                    results.append({
                        "recording_id": recording_id,
                        "status": "success",
                        "output_file": str(output_path),
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
        "total": len(recording_ids),
        "successful": sum(1 for r in results if r["status"] == "success"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
        "format": output_format,
        "results": results,
    }