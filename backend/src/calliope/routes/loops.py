"""Audio looping and slicing API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from calliope.audio.loop_slicer import LoopSampler, slice_audio, create_sliced_rack
from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/loops", tags=["loops"])


@router.post("/slice")
async def slice_audio_recording(
    recording_id: str,
    session_id: str | None = None,
    method: str = "transients",
    sensitivity: float = 0.5,
) -> dict:
    """
    Slice a recording into samples based on detection method.
    Methods: transients, beats, time
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

    markers = slice_audio(samples, sr, method=method, sensitivity=sensitivity)

    return {
        "recording_id": recording_id,
        "slices": markers,
        "slice_count": len(markers),
        "duration_sec": len(samples) / sr,
    }


@router.post("/detect-tempo")
async def detect_tempo_from_recording(
    recording_id: str,
    session_id: str | None = None,
    min_bpm: float = 60.0,
    max_bpm: float = 200.0,
) -> dict:
    """
    Detect tempo from a recording.
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

    from calliope.audio.beat_sync import TempoDetector

    detector = TempoDetector(sr)
    tempo, confidence = detector.detect_bpm(samples, min_bpm, max_bpm)

    beats = detector.find_beats(samples, tempo, confidence)
    swing = detector.estimate_swing(samples, beats, tempo)

    return {
        "recording_id": recording_id,
        "tempo_bpm": tempo,
        "confidence": confidence,
        "beat_count": len(beats),
        "swing": swing,
        "beat_times": beats[:20],
    }


@router.post("/warp-tempo")
async def warp_recording_tempo(
    recording_id: str,
    session_id: str | None = None,
    source_tempo: float = 120.0,
    target_tempo: float = 120.0,
    mode: str = "stretch",
) -> dict:
    """
    Warp a recording to a target tempo.
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

    from calliope.audio.beat_sync import sync_to_tempo

    warped = sync_to_tempo(samples, sr, source_tempo, target_tempo, mode)

    output_path = settings.processed_path / f"{recording_id}_warped_{target_tempo}bpm.wav"
    write_audio_file(output_path, warped, sr, format="wav")

    return {
        "recording_id": recording_id,
        "source_tempo": source_tempo,
        "target_tempo": target_tempo,
        "output_file": str(output_path),
        "duration_sec": len(warped) / sr,
        "stretch_factor": source_tempo / target_tempo,
    }


@router.post("/create-sliced-rack")
async def create_sliced_rack_route(
    recording_id: str,
    session_id: str | None = None,
    target_tempo: float = 120.0,
    slices_per_beat: int = 4,
    output_format: str = "wav",
) -> dict:
    """
    Create a sliced loop rack from a recording.
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

    from calliope.audio.loop_slicer import LoopSampler

    sampler = LoopSampler(sr)
    sampler.load(samples)
    sampler.slice_at_transients()

    sliced = sampler.create_sliced_loop(target_tempo, slices_per_beat)

    output_path = settings.processed_path / f"{recording_id}_sliced_{target_tempo}bpm.{output_format}"
    write_audio_file(output_path, sliced, sr, format=output_format)

    return {
        "recording_id": recording_id,
        "target_tempo": target_tempo,
        "slices_per_beat": slices_per_beat,
        "output_file": str(output_path),
        "slice_count": len(sampler.slices),
    }


@router.post("/extract-loop")
async def extract_loop(
    recording_id: str,
    session_id: str | None = None,
    start_sec: float = 0.0,
    end_sec: float = 4.0,
    crossfade_ms: float = 10.0,
    loop_count: int = 1,
) -> dict:
    """
    Extract a loop region and repeat it.
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

    from calliope.audio.loop_slicer import LoopSampler

    sampler = LoopSampler(sr)
    sampler.load(samples)
    sampler.add_loop(start_sec, end_sec, crossfade_ms)

    loop_audio = sampler.extract_loop(sampler.loops[0])

    loop_duration = end_sec - start_sec
    total_duration = loop_duration * loop_count
    output_samples = np.tile(loop_audio, loop_count)[: int(total_duration * sr)]

    output_path = settings.processed_path / f"{recording_id}_loop_{start_sec:.1f}s_{end_sec:.1f}s.wav"
    write_audio_file(output_path, output_samples, sr, format="wav")

    return {
        "recording_id": recording_id,
        "loop_start_sec": start_sec,
        "loop_end_sec": end_sec,
        "loop_count": loop_count,
        "output_file": str(output_path),
        "duration_sec": len(output_samples) / sr,
    }