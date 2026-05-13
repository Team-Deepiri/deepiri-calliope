"""Audio file I/O — read/write WAV, MP3, OGG, FLAC via soundfile / pydub."""

from __future__ import annotations

import io
import mimetypes
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf
from pydub import AudioSegment

SupportedFormat = Literal["wav", "mp3", "ogg", "flac", "m4a", "aac"]


class AudioReadError(Exception):
    pass


class AudioWriteError(Exception):
    pass


class UnsupportedFormatError(Exception):
    pass


def read_audio_file(
    path: str | Path,
    sr: int | None = None,
    mono: bool = True,
) -> tuple[np.ndarray, int]:
    """
    Read audio file and return (samples, sample_rate).
    
    Returns stereo (2, n) or mono (n,) array depending on `mono`.
    If `sr` is provided, resamples to target rate.
    """
    path = Path(path)
    if not path.exists():
        raise AudioReadError(f"File not found: {path}")

    ext = path.suffix.lstrip(".").lower()
    if ext not in ("wav", "flac"):
        audio = AudioSegment.from_file(str(path))
        samples = np.array(audio.get_array_of_samples(), dtype=np.float64)
        if audio.channels == 2:
            left = samples[0::2]
            right = samples[1::2]
        else:
            left = right = samples
        sr_found = audio.frame_rate
        if sr_found != sr:
            from scipy import signal as sp_signal
            if sr is not None:
                ratio = sr / sr_found
                n = int(left.size * ratio)
                left = sp_signal.resample(left, n)
                right = sp_signal.resample(right, n)
        if mono:
            return (left + right) / 2.0, (sr or sr_found)
        return np.stack([left, right], axis=0), (sr or sr_found)

    data, sr_found = sf.read(str(path), dtype="float64")
    if sr is not None and sr != sr_found:
        from scipy import signal as sp_signal
        ratio = sr / sr_found
        n = int(data.shape[0] * ratio)
        if data.ndim == 1:
            data = sp_signal.resample(data, n)
        else:
            left = sp_signal.resample(data[:, 0], n)
            right = sp_signal.resample(data[:, 1], n)
            data = np.stack([left, right], axis=1)
        sr_found = sr

    if mono and data.ndim == 2:
        data = (data[:, 0] + data[:, 1]) / 2.0
    return data, sr_found


def write_audio_file(
    path: str | Path,
    samples: np.ndarray,
    sr: int,
    format: SupportedFormat = "wav",
    subtype: str = "PCM_24",
) -> Path:
    """
    Write audio samples to file.
    
    `samples` can be mono (n,) or stereo (2, n) or (n, 2).
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    y = np.asarray(samples, dtype=np.float64)
    if y.ndim == 1:
        y = y.reshape(-1, 1)
    elif y.ndim == 2 and y.shape[0] == 2:
        y = y.T

    try:
        if format in ("mp3", "ogg", "m4a", "aac"):
            buffer = io.BytesIO()
            sf.write(buffer, y, sr, format=format.upper(), subtype=subtype)
            buffer.seek(0)
            segment = AudioSegment.from_mp3(buffer) if format == "mp3" else AudioSegment.from_file(buffer)
            segment.export(str(path), format=format)
        else:
            sf.write(str(path), y, sr, subtype=subtype)
    except Exception as e:
        raise AudioWriteError(f"Failed to write {path}: {e}")

    return path


def convert_format(
    input_path: str | Path,
    output_path: str | Path,
    output_format: SupportedFormat,
    sr: int | None = None,
    bit_depth: int = 24,
) -> Path:
    """
    Convert audio file to different format.
    """
    samples, sample_rate = read_audio_file(input_path, sr=sr)
    subtype_map = {16: "PCM_16", 24: "PCM_24", 32: "PCM_32"}
    subtype = subtype_map.get(bit_depth, "PCM_24")
    return write_audio_file(output_path, samples, sample_rate, format=output_format, subtype=subtype)


def get_audio_info(path: str | Path) -> dict:
    """
    Get audio file metadata without loading full samples.
    """
    path = Path(path)
    info = sf.info(str(path))
    return {
        "duration_sec": info.duration,
        "sample_rate": info.samplerate,
        "channels": info.channels,
        "frames": info.frames,
        "format": info.format,
        "subtype": info.subtype,
    }


def detect_format(path: str | Path) -> str | None:
    """Detect MIME type from file extension."""
    path = Path(path)
    mime_type, _ = mimetypes.guess_type(str(path))
    return mime_type


def normalize_levels(samples: np.ndarray, target_lufs: float = -18.0) -> np.ndarray:
    """
    Normalize audio levels to target LUFS.
    Simple peak normalization for now - full LUFS would need pyloudnorm.
    """
    peak = float(np.max(np.abs(samples)))
    if peak < 1e-9:
        return samples
    target_linear = 10 ** (target_lufs / 20.0)
    gain = target_linear / peak
    return (samples * gain).clip(-1.0, 1.0)


def mix_down_to_mono(samples: np.ndarray) -> np.ndarray:
    """Mix stereo to mono."""
    y = np.asarray(samples, dtype=np.float64)
    if y.ndim == 1:
        return y
    if y.shape[0] == 2:
        return ((y[0] + y[1]) / 2.0).astype(np.float64)
    return y


def interleave_channels(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Interleave two mono arrays into stereo buffer."""
    left = np.asarray(left, dtype=np.float64).ravel()
    right = np.asarray(right, dtype=np.float64).ravel()
    n = min(len(left), len(right))
    stereo = np.empty((2 * n,), dtype=np.float64)
    stereo[0::2] = left[:n]
    stereo[1::2] = right[:n]
    return stereo