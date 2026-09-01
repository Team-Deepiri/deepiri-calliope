"""Speech-to-singing: neural TTS of lyrics, then a gentle sung pitch contour.

Hard per-note retune of macOS say is what made an earlier version robotic.
Default path is local Piper (ONNX). OpenAI TTS is used when a key is set.
macOS `say` is opt-in only (CALLIOPE_TTS_BACKEND=macos).
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.signal import resample

from calliope.audio.vocal_synth import MelodyNote
from calliope.pitch.hz_cents import hz_to_midi, midi_to_hz
from calliope.pitch.yin import yin_track_series_voicing
from calliope.tune.warp_autotune import warp_pitch_map

OPENAI_VOICES: dict[str, str] = {
    "soprano": "nova",
    "tenor": "echo",
    "alt": "shimmer",
    "alto": "shimmer",
    "bass": "onyx",
}

SAY_VOICES: dict[str, tuple[str, ...]] = {
    "soprano": ("Sandy (English (US))", "Flo (English (US))", "Samantha"),
    "tenor": ("Reed (English (US))", "Eddy (English (US))", "Daniel"),
    "alt": ("Flo (English (US))", "Samantha"),
    "alto": ("Flo (English (US))", "Samantha"),
    "bass": ("Rocko (English (US))", "Albert"),
}


def tts_backend_preference() -> str:
    return (os.environ.get("CALLIOPE_TTS_BACKEND") or "auto").strip().lower()


def tts_available() -> bool:
    pref = tts_backend_preference()
    if pref == "macos":
        return shutil.which("say") is not None
    try:
        from calliope.config import get_settings

        if get_settings().openai_api_key and pref in {"auto", "openai"}:
            return True
    except Exception:
        pass
    if pref in {"auto", "piper"}:
        from calliope.audio.tts_piper import piper_available

        return piper_available()
    return False


def _resample(y: np.ndarray, dst_n: int) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    dst_n = max(1, int(dst_n))
    if y.size == 0:
        return np.zeros(dst_n, dtype=np.float64)
    if y.size == dst_n:
        return y.copy()
    out = resample(y, dst_n)
    if out.size > dst_n:
        return out[:dst_n]
    if out.size < dst_n:
        return np.pad(out, (0, dst_n - out.size))
    return out.astype(np.float64)


def _tts_piper(text: str, voice_name: str) -> tuple[np.ndarray, int] | None:
    try:
        from calliope.audio.tts_piper import piper_available, synthesize_piper

        if not piper_available():
            return None
        return synthesize_piper(text, voice_name, length_scale=1.32)
    except Exception:
        return None


def _tts_openai(text: str, voice_name: str) -> tuple[np.ndarray, int] | None:
    try:
        from calliope.config import get_settings

        key = get_settings().openai_api_key
        if not key:
            return None
        from openai import OpenAI
        from pydub import AudioSegment

        client = OpenAI(api_key=key)
        voice = OPENAI_VOICES.get(voice_name, "alloy")
        resp = client.audio.speech.create(model="tts-1-hd", voice=voice, input=text[:4096])
        raw = getattr(resp, "content", None) or resp.read()
        seg = AudioSegment.from_file(io.BytesIO(raw), format="mp3")
        samples = np.array(seg.get_array_of_samples(), dtype=np.float64)
        if seg.channels == 2:
            samples = samples.reshape(-1, 2).mean(axis=1)
        peak = float(np.max(np.abs(samples))) or 1.0
        return samples / peak * 0.9, int(seg.frame_rate)
    except Exception:
        return None


@lru_cache(maxsize=1)
def macos_say_voices() -> frozenset[str]:
    if shutil.which("say") is None:
        return frozenset()
    try:
        proc = subprocess.run(["say", "-v", "?"], capture_output=True, text=True, timeout=8, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return frozenset()
    names: set[str] = set()
    for line in (proc.stdout or "").splitlines():
        if "#" not in line:
            continue
        name = line.split("#", 1)[0].rstrip()
        parts = name.rsplit(None, 1)
        if len(parts) == 2 and "_" in parts[1]:
            name = parts[0].rstrip()
        if name:
            names.add(name)
    return frozenset(names)


def _tts_macos(text: str, voice_name: str) -> tuple[np.ndarray, int] | None:
    if shutil.which("say") is None:
        return None
    available = macos_say_voices()
    voice = next((v for v in SAY_VOICES.get(voice_name, ()) if v in available), None)
    if voice is None:
        voice = "Samantha" if "Samantha" in available else None
    if not voice:
        return None
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    path = Path(tmp.name)
    tmp.close()
    try:
        proc = subprocess.run(
            ["say", "-v", voice, "-r", "145", "-o", str(path), "--data-format=LEI16@22050", text],
            capture_output=True,
            timeout=45,
            check=False,
        )
        if proc.returncode != 0 or not path.is_file() or path.stat().st_size < 44:
            return None
        from calliope.audio.io import read_audio_file

        audio, sr = read_audio_file(path, mono=True)
        return np.asarray(audio, dtype=np.float64).ravel(), int(sr)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None
    finally:
        path.unlink(missing_ok=True)


def render_speech(lyrics: str, voice_name: str) -> tuple[np.ndarray, int, str] | None:
    """Return (mono, sr, backend) or None."""
    text = " ".join((lyrics or "").split())
    if not text:
        return None
    pref = tts_backend_preference()
    order: list[str]
    if pref == "macos":
        order = ["macos"]
    elif pref == "openai":
        order = ["openai", "piper"]
    elif pref == "piper":
        order = ["piper"]
    else:
        order = ["piper", "openai"]

    for name in order:
        spoken = {"piper": _tts_piper, "openai": _tts_openai, "macos": _tts_macos}[name](text, voice_name)
        if spoken is not None:
            return spoken[0], spoken[1], {"piper": "piper", "openai": "openai_tts", "macos": "macos_say"}[name]
    return None


def _melody_target_hz(
    melody: list[MelodyNote],
    n_frames: int,
    hop: int,
    sr: int,
    voice_median_hz: float,
) -> np.ndarray:
    """Melody F0 in the speaker's octave, stretched to the speech length."""
    times = (np.arange(n_frames, dtype=np.float64) * hop + hop * 0.5) / float(sr)
    if not melody or n_frames <= 0:
        return np.full(n_frames, voice_median_hz, dtype=np.float64)

    last = max(m[1] + m[2] for m in melody)
    dur = float(n_frames * hop / sr)
    scale = dur / max(last, 1e-4)
    voice_midi = hz_to_midi(voice_median_hz)
    if not np.isfinite(voice_midi):
        voice_midi = 57.0
    mel_mid = float(np.median([m[0] for m in melody]))
    octave = round((voice_midi - mel_mid) / 12.0) * 12.0
    center_pull = (voice_midi - (mel_mid + octave)) * 0.25
    shift = octave + center_pull

    target = np.zeros(n_frames, dtype=np.float64)
    for midi, start, length in melody:
        t0, t1 = start * scale, (start + length) * scale
        hz = midi_to_hz(float(midi) + shift)
        target[(times >= t0) & (times < t1)] = hz
    for i in range(1, n_frames):
        if target[i] <= 0:
            target[i] = target[i - 1]
    if float(target[0]) <= 0:
        target[target <= 0] = voice_median_hz

    # Light vibrato on the contour (~30 cents), not a second warp pass.
    vib = 2.0 ** (0.30 * np.sin(2.0 * np.pi * 5.4 * times) / 12.0)
    return target * vib


def _apply_sung_contour(y: np.ndarray, sr: int, melody: list[MelodyNote]) -> np.ndarray:
    """Gently follow the melody without leaving the speaker's range."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size < sr // 4 or not melody:
        return y
    frame = 1024 if sr >= 16_000 else 512
    hop = max(64, frame // 4)
    f0, voicing = yin_track_series_voicing(y, sr, frame=frame, hop=hop, fmin=70.0, fmax=500.0)
    voiced = (f0 > 80.0) & (voicing > 0.35)
    if not np.any(voiced):
        return y
    median = float(np.median(f0[voiced]))
    tgt = _melody_target_hz(melody, f0.size, hop, sr, median)
    # Cap motion so formants stay human; pull hard enough to hear a sung line.
    lo, hi = 2.0 ** (-5.0 / 12.0), 2.0 ** (5.0 / 12.0)
    ratio = np.clip(tgt / np.maximum(f0, 1.0), lo, hi)
    tgt_clamped = np.where(voiced, f0 * ratio, 0.0)
    try:
        return warp_pitch_map(
            y,
            sr,
            f0,
            tgt_clamped,
            hop=hop,
            frame=frame,
            strength=0.62,
            smooth_bins=13,
        )
    except (ValueError, FloatingPointError):
        return y


def sing_from_speech(
    speech: np.ndarray,
    speech_sr: int,
    melody: list[MelodyNote],
    *,
    sr: int,
    vocal_style: str = "lead",
    max_seconds: float = 40.0,
) -> np.ndarray:
    """Keep the Piper take, then lean pitch toward a sung contour."""
    y = np.asarray(speech, dtype=np.float64).ravel()
    if y.size == 0:
        return np.zeros(int(0.25 * sr), dtype=np.float64)
    if speech_sr != sr:
        y = _resample(y, int(round(y.size * sr / max(speech_sr, 1))))
    max_n = int(max_seconds * sr)
    if y.size > max_n:
        y = y[:max_n]
    y = _apply_sung_contour(y, sr, melody)
    if vocal_style in {"harmonies", "choir"}:
        delay = int(0.018 * sr)
        doubled = np.pad(y, (delay, 0))[: y.size] * (0.28 if vocal_style == "harmonies" else 0.22)
        y = y + doubled
    peak = float(np.max(np.abs(y)))
    if peak > 1e-9:
        y = y / peak * 0.88
    return y.astype(np.float64)


def synthesize_speech_to_singing(
    lyrics: str,
    melody: list[MelodyNote],
    *,
    voice_name: str = "soprano",
    vocal_style: str = "lead",
    sr: int = 48_000,
) -> tuple[np.ndarray, str] | None:
    spoken = render_speech(lyrics, voice_name)
    if spoken is None:
        return None
    audio, speech_sr, backend = spoken
    sung = sing_from_speech(audio, speech_sr, melody, sr=sr, vocal_style=vocal_style)
    if float(np.max(np.abs(sung))) < 1e-4:
        return None
    return sung, backend
