"""Real-time audio monitoring API routes."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from calliope.audio.monitoring import MonitoringDashboard, RTAMeter, LevelMeter, LoudnessMeter
from calliope.audio.io import read_audio_file

router = APIRouter(prefix="/v1/monitor", tags=["monitoring"])


@router.get("/recording/{recording_id}")
async def get_monitoring_data(
    recording_id: str,
    session_id: str | None = None,
) -> dict:
    """
    Get comprehensive monitoring data for a recording.
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
        return {"error": "Recording not found"}

    dashboard = MonitoringDashboard(sr)
    monitoring = dashboard.process(samples)

    return {
        "recording_id": recording_id,
        "duration_sec": len(samples) / sr if samples.ndim == 1 else samples.shape[0] / sr,
        "monitoring": monitoring,
    }


@router.get("/rta/{recording_id}")
async def get_rta_data(
    recording_id: str,
    session_id: str | None = None,
    band_count: int = 31,
) -> dict:
    """
    Get real-time analyzer data for a recording.
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
        return {"error": "Recording not found"}

    rta = RTAMeter(band_count=band_count, sr=sr)
    
    if samples.ndim == 2:
        samples = (samples[:, 0] + samples[:, 1]) / 2

    return {
        "recording_id": recording_id,
        "rta": rta.process(samples),
    }


@router.get("/loudness/{recording_id}")
async def get_loudness_data(
    recording_id: str,
    session_id: str | None = None,
) -> dict:
    """
    Get loudness metering data for a recording.
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
        return {"error": "Recording not found"}

    meter = LoudnessMeter(sr=sr)
    
    if samples.ndim == 2:
        mono = (samples[:, 0] + samples[:, 1]) / 2
    else:
        mono = samples

    from calliope.audio.loudness import measure_lufs
    
    integrated = measure_lufs(samples, sr)

    block_size = int(0.4 * sr)
    short_term_values = []
    
    for i in range(0, len(mono) - block_size, block_size // 2):
        block = mono[i : i + block_size]
        block_lufs = 10 * np.log10(np.mean(block ** 2) + 1e-10)
        short_term_values.append(block_lufs)

    return {
        "recording_id": recording_id,
        "integrated_lufs": integrated,
        "short_term_max": max(short_term_values) if short_term_values else -70,
        "short_term_avg": sum(short_term_values) / len(short_term_values) if short_term_values else -70,
        "true_peak_dbfs": float(20 * np.log10(np.max(np.abs(samples)) + 1e-10)),
        "duration_sec": len(samples) / sr,
    }


@router.post("/websocket/analyze")
async def websocket_monitoring(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time audio monitoring.
    Client sends audio chunks, server returns comprehensive monitoring data.
    """
    await websocket.accept()

    dashboard = MonitoringDashboard(sr=48000)

    try:
        while True:
            data = await websocket.receive_bytes()

            import numpy as np
            samples = np.frombuffer(data, dtype=np.float32)

            monitoring = dashboard.process(samples)

            await websocket.send_json({
                "level": monitoring["level"],
                "vu": monitoring["vu"],
                "loudness": monitoring["loudness"],
                "stereo": monitoring["stereo"],
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass


@router.get("/meter-presets")
async def get_meter_presets() -> dict:
    """
    Get preset meter configurations for different use cases.
    """
    presets = {
        "broadcast": {
            "peak_hold": 2.0,
            "decay_rate": 20,
            "green_threshold": -20,
            "yellow_threshold": -9,
            "red_threshold": -1,
        },
        "music": {
            "peak_hold": 1.5,
            "decay_rate": 25,
            "green_threshold": -18,
            "yellow_threshold": -6,
            "red_threshold": 0,
        },
        "podcast": {
            "peak_hold": 3.0,
            "decay_rate": 15,
            "green_threshold": -22,
            "yellow_threshold": -12,
            "red_threshold": -3,
        },
        "mastering": {
            "peak_hold": 5.0,
            "decay_rate": 10,
            "green_threshold": -16,
            "yellow_threshold": -6,
            "red_threshold": -0.5,
        },
    }

    return {"presets": presets}