"""AI mix and mastering API routes."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Body

from calliope.audio.ai_mix import AIMixEngine, auto_mix, auto_master
from calliope.audio.conductor import Conductor
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


@router.post("/arrange-from-text")
async def arrange_from_text(
    prompt: str = Body(..., embed=True),
    bpm: int = Body(128, embed=True),
    key: str = Body("C", embed=True),
    genre: str = Body("", embed=True),
) -> dict:
    """
    Accept a text prompt describing arrangement structure
    and return an arrangement plan.
    """
    import re
    from calliope.audio.harmony_engine import HarmonyEngine

    harmony = HarmonyEngine(root=key, scale_type="minor" if "minor" in prompt.lower() or "dark" in prompt.lower() else "major")
    progression = harmony.generate_progression(
        mood="dark" if "dark" in prompt.lower() else "jazz" if "jazz" in prompt.lower() else "happy",
        length=8,
    )

    mood_type = "dark" if "dark" in prompt.lower() else "energetic" if "energetic" in prompt.lower() else "balanced"
    instrument_hints = []
    if "piano" in prompt.lower():
        instrument_hints.append("piano")
    if "strings" in prompt.lower():
        instrument_hints.append("strings")
    if "synth" in prompt.lower() or "synth" in prompt:
        instrument_hints.append("synth")
    if "guitar" in prompt.lower():
        instrument_hints.append("guitar")

    sections = []
    section_names = re.findall(r"(intro|verse|chorus|bridge|build-up|drop|breakdown|outro)", prompt.lower())
    if not section_names:
        section_names = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]

    bars_total = 0
    for name in section_names:
        bars = 8 if name in ("verse", "chorus") else 4
        if "intro" in name or "outro" in name:
            bars = 8
        if "bridge" in name or "breakdown" in name:
            bars = 8
        section = {
            "name": name.capitalize(),
            "start_bar": bars_total,
            "bars": bars,
            "instruments": instrument_hints if instrument_hints else ["drums", "bass", "synth_lead"],
            "dynamics": "soft" if name in ("intro", "breakdown", "bridge") else "loud" if name in ("drop", "chorus") else "medium",
            "chord_progression": [list(map(int, c)) for c in progression],
        }
        sections.append(section)
        bars_total += bars

    return {
        "prompt": prompt,
        "bpm": bpm,
        "key": key,
        "genre": genre or "auto-detected",
        "mood": mood_type,
        "sections": sections,
        "total_bars": bars_total,
        "estimated_duration_sec": (bars_total * 4 * 60) / bpm,
    }


@router.post("/master-with-reference")
async def master_with_reference(
    recording_id: str = Body(...),
    reference_clip_id: str = Body(...),
    session_id: str | None = Body(None),
) -> dict:
    """
    Accept a recording_id and a reference clip_id,
    analyze reference track, and master the recording to match
    the reference's tonal balance, loudness, and dynamics.
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

    from calliope.routes.clips import _clips
    ref_clip = _clips.get(reference_clip_id)
    if ref_clip is None:
        raise HTTPException(status_code=404, detail="Reference clip not found")

    ref_path = ref_clip.get("path") or ref_clip.get("file_path")
    if not ref_path or not Path(ref_path).exists():
        raise HTTPException(status_code=404, detail="Reference clip file not found")

    ref_samples, ref_sr = read_audio_file(ref_path, sr=sr, mono=False)

    engine = AIMixEngine(sr)
    ref_analysis = engine.analyze_track_balance(ref_samples)
    target_lufs = max(-18.0, min(-8.0, ref_analysis["rms_mono_dbfs"] + 14.0))

    mastering_params = {
        "target_lufs": target_lufs,
        "brightness": min(1.0, max(0.0, ref_analysis["frequency_balance"]["high_ratio"] * 2)),
        "warmth": min(1.0, max(0.0, ref_analysis["frequency_balance"]["low_ratio"] * 2)),
        "punch": 0.3 + abs(ref_analysis["dynamic_range_db"] - 20.0) / 40.0,
        "stereo_width": min(2.0, max(0.0, abs(ref_analysis["stereo_correlation"]) * 2)),
    }

    result = engine.full_auto_mix(
        samples,
        target_lufs=mastering_params["target_lufs"],
        brightness=mastering_params["brightness"],
        warmth=mastering_params["warmth"],
        punch=mastering_params["punch"],
        stereo_width=mastering_params["stereo_width"],
    )

    output_path = settings.processed_path / f"{recording_id}_ref_mastered.wav"
    write_audio_file(output_path, result["processed_samples"], sr, format="wav")

    return {
        "recording_id": recording_id,
        "reference_clip_id": reference_clip_id,
        "output_file": str(output_path),
        "reference_analysis": {
            "rms_mono_dbfs": ref_analysis["rms_mono_dbfs"],
            "dynamic_range_db": ref_analysis["dynamic_range_db"],
            "stereo_correlation": ref_analysis["stereo_correlation"],
            "frequency_balance": ref_analysis["frequency_balance"],
        },
        "mastering_params": mastering_params,
        "output_rms_dbfs": result["output_analysis"]["rms_mono_dbfs"],
    }


@router.post("/analyze-reference/{clip_id}")
async def analyze_reference(clip_id: str) -> dict:
    """
    Analyze a reference track and return detailed spectral/temporal profile
    that can be used for matching.
    """
    from calliope.routes.clips import _clips
    ref_clip = _clips.get(clip_id)
    if ref_clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")

    ref_path = ref_clip.get("path") or ref_clip.get("file_path")
    if not ref_path or not Path(ref_path).exists():
        raise HTTPException(status_code=404, detail="Clip file not found")

    sr = 48000
    samples, sr = read_audio_file(ref_path, sr=sr, mono=False)

    engine = AIMixEngine(sr)
    analysis = engine.analyze_track_balance(samples)

    from calliope.audio.loudness import LUFSMeter
    lufs_meter = LUFSMeter(sr)
    loudness = lufs_meter.update(samples)

    from scipy.signal import spectrogram
    f, t, Sxx = spectrogram(
        samples if samples.ndim == 1 else (samples[:, 0] + samples[:, 1]) / 2,
        sr,
        nperseg=2048,
        noverlap=1536,
    )
    spectral_centroid = float(np.sum(f * np.sum(Sxx, axis=1)) / np.sum(Sxx))
    spectral_rolloff = float(f[np.where(np.cumsum(np.sum(Sxx, axis=1)) >= 0.85 * np.sum(Sxx))[0][0]] if np.any(Sxx > 0) else 0)

    return {
        "clip_id": clip_id,
        "sample_rate": sr,
        "duration_sec": len(samples) / sr,
        "loudness": loudness,
        "frequency_balance": analysis["frequency_balance"],
        "dynamics": {
            "rms_dbfs": analysis["rms_mono_dbfs"],
            "peak_dbfs": analysis["peak_left_dbfs"],
            "dynamic_range_db": analysis["dynamic_range_db"],
            "crest_factor_db": analysis["peak_left_dbfs"] - analysis["rms_mono_dbfs"],
        },
        "stereo": {
            "correlation": analysis["stereo_correlation"],
            "balance_db": analysis["rms_left_dbfs"] - analysis["rms_right_dbfs"],
        },
        "spectral_profile": {
            "centroid_hz": round(spectral_centroid, 1),
            "rolloff_hz": round(spectral_rolloff, 1),
            "low_ratio": analysis["frequency_balance"]["low_ratio"],
            "mid_ratio": analysis["frequency_balance"]["mid_ratio"],
            "high_ratio": analysis["frequency_balance"]["high_ratio"],
        },
        "mastering_targets": {
            "suggested_lufs": max(-18.0, min(-8.0, round(analysis["rms_mono_dbfs"] + 14.0, 1))),
            "suggested_brightness": round(min(1.0, max(0.0, analysis["frequency_balance"]["high_ratio"] * 2)), 2),
            "suggested_warmth": round(min(1.0, max(0.0, analysis["frequency_balance"]["low_ratio"] * 2)), 2),
        },
    }


@router.post("/conduct")
async def conduct_song(
    prompt: str = Body(..., embed=True),
    bpm: int = Body(128, embed=True),
    key: str = Body("C", embed=True),
    scale: str = Body("minor", embed=True),
    mood: str = Body("dark", embed=True),
    duration_bars: int = Body(32, embed=True),
) -> dict:
    """
    Accept a prompt and conduct full song generation using the Conductor class.
    Returns the arrangement and generated audio file path.
    """
    settings = get_settings()
    sr = 48000

    conductor = Conductor(sr=sr)
    final_audio = conductor.conduct_song(
        prompt=prompt,
        bpm=bpm,
        key=key,
        scale_type=scale,
        mood=mood,
        duration_bars=duration_bars,
    )

    output_path = settings.exports_path / f"conducted_{hash(prompt) % 100000}.wav"
    write_audio_file(output_path, final_audio, sr, format="wav")

    from calliope.audio.loudness import measure_lufs
    output_lufs = measure_lufs(final_audio, sr)

    return {
        "prompt": prompt,
        "bpm": bpm,
        "key": key,
        "scale": scale,
        "mood": mood,
        "output_file": str(output_path),
        "duration_sec": len(final_audio) / sr,
        "output_lufs": output_lufs,
        "sections": [
            {"name": "Intro", "start_bar": 0, "bars": 8},
            {"name": "Body", "start_bar": 8, "bars": 16},
            {"name": "Outro", "start_bar": 24, "bars": 8},
        ],
    }