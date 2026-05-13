"""Real-time audio visualization API routes."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from calliope.audio.visualizer import create_visualizer_chain, visualize_audio_block
from calliope.audio.io import read_audio_file

router = APIRouter(prefix="/v1/visualize", tags=["visualization"])


class VisualizeRequest(BaseModel):
    samples: list[float]
    sample_rate: int = 48000
    visualize_pitch: bool = True
    visualize_spectrum: bool = True
    visualize_loudness: bool = True


class VisualizeResponse(BaseModel):
    waveform: dict
    spectrum: dict
    pitch: dict
    loudness: dict
    stereo: dict | None = None


@router.post("/process", response_model=VisualizeResponse)
async def visualize_audio(request: VisualizeRequest) -> VisualizeResponse:
    """
    Process audio samples through all visualizers and return visualization data.
    """
    import numpy as np
    
    samples = np.asarray(request.samples, dtype=np.float64)
    sr = request.sample_rate
    
    visualizers = create_visualizer_chain(sr)
    result = visualize_audio_block(samples, sr, visualizers)
    
    return VisualizeResponse(
        waveform=result["waveform"],
        spectrum=result["spectrum"],
        pitch=result["pitch"],
        loudness=result["loudness"],
        stereo=result.get("stereo"),
    )


@router.get("/recording/{recording_id}")
async def visualize_recording(
    recording_id: str,
    session_id: str | None = None,
    visualize_pitch: bool = True,
    visualize_spectrum: bool = True,
) -> dict:
    """
    Generate visualization data for a recorded audio file.
    Returns downsampled data suitable for frontend rendering.
    """
    from calliope.routes.recordings import _recordings
    
    if session_id and session_id in _recordings:
        session = _recordings[session_id]
        recording = next((f for f in session["files"] if f["id"] == recording_id), None)
        
        if recording:
            from pathlib import Path
            file_path = Path(recording["path"])
            
            if file_path.exists():
                samples, sr = read_audio_file(file_path, mono=False)
                
                visualizers = create_visualizer_chain(sr)
                
                if samples.ndim == 1:
                    mono = samples
                else:
                    mono = (samples[:, 0] + samples[:, 1]) / 2
                
                result = visualize_audio_block(samples if samples.ndim == 2 else mono, sr, visualizers)
                
                total_samples = len(mono)
                block_size = sr // 10
                
                waveform_blocks = []
                for i in range(0, total_samples, block_size):
                    block = mono[i : i + block_size]
                    peaks = [float(np.max(np.abs(block[j :: block_size // 100]))) for j in range(min(100, block_size))]
                    waveform_blocks.append({
                        "start": i / sr,
                        "peaks": peaks,
                    })
                
                return {
                    "recording_id": recording_id,
                    "duration_sec": total_samples / sr,
                    "sample_rate": sr,
                    "waveform_blocks": waveform_blocks,
                    "pitch_history": result["pitch"]["history"],
                    "confidence_history": result["pitch"]["confidence_history"],
                    "octave_levels": result["spectrum"]["octave_levels"],
                    "loudness": {
                        "integrated": result["loudness"]["integrated"],
                        "short_term": result["loudness"]["short_term"],
                        "momentary": result["loudness"]["momentary"],
                    },
                    "stereo": result.get("stereo"),
                }
    
    return {"error": "Recording not found"}


@router.post("/websocket/analyze")
async def websocket_visualization(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time audio visualization.
    Client sends audio chunks, server responds with visualization data.
    """
    await websocket.accept()
    
    sr = 48000
    visualizers = create_visualizer_chain(sr)
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            import numpy as np
            samples = np.frombuffer(data, dtype=np.float32)
            
            result = visualize_audio_block(samples, sr, visualizers)
            
            import json
            await websocket.send_json({
                "waveform": result["waveform"],
                "spectrum": result["spectrum"],
                "pitch": result["pitch"],
                "loudness": result["loudness"],
            })
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass


@router.get("/spectrum/{recording_id}")
async def get_spectrum_data(
    recording_id: str,
    session_id: str | None = None,
    resolution: str = "fine",
) -> dict:
    """
    Get detailed spectrum data for a recording.
    Resolution: coarse (64 bands), medium (128 bands), fine (256 bands)
    """
    from calliope.routes.recordings import _recordings
    
    band_map = {
        "coarse": 64,
        "medium": 128,
        "fine": 256,
        "ultra": 512,
    }
    
    band_count = band_map.get(resolution, 128)
    
    if session_id and session_id in _recordings:
        session = _recordings[session_id]
        recording = next((f for f in session["files"] if f["id"] == recording_id), None)
        
        if recording:
            from pathlib import Path
            file_path = Path(recording["path"])
            
            if file_path.exists():
                samples, sr = read_audio_file(file_path, mono=True)
                
                from calliope.audio.spectrum import compute_spectrum
                
                fft_size = 2048
                hop = 512
                
                spectrum_data = []
                for i in range(0, len(samples) - fft_size, hop):
                    block = samples[i : i + fft_size]
                    
                    spec = compute_spectrum(block, sr, fft_size)
                    
                    avg_bands = []
                    band_size = len(spec) // band_count
                    for b in range(band_count):
                        start = b * band_size
                        end = min((b + 1) * band_size, len(spec))
                        avg_bands.append(float(np.mean(spec[start:end])))
                    
                    spectrum_data.append(avg_bands)
                
                return {
                    "recording_id": recording_id,
                    "band_count": band_count,
                    "spectrum_frames": spectrum_data,
                    "time_resolution": hop / sr,
                }
    
    return {"error": "Recording not found"}