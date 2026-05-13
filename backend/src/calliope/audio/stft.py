from __future__ import annotations

import numpy as np

from calliope.dsp.core.windows import hann_window


def stft_magnitude(y: np.ndarray, *, n_fft: int, hop: int, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Return (|STFT|, times_sec) with Hann window, centered frames.
    Shape: (n_frames, n_fft//2+1)
    """
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size < n_fft:
        y = np.pad(y, (0, n_fft - y.size))
    win = hann_window(n_fft)
    frames = []
    times = []
    for start in range(0, len(y) - n_fft + 1, hop):
        frame = y[start : start + n_fft] * win
        spec = np.abs(np.fft.rfft(frame, n=n_fft))
        frames.append(spec)
        times.append((start + n_fft // 2) / sr)
    if not frames:
        return np.zeros((0, n_fft // 2 + 1)), np.zeros(0)
    return np.stack(frames, axis=0), np.array(times, dtype=np.float64)
