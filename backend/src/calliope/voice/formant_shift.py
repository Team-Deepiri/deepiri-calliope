from __future__ import annotations

import numpy as np
from scipy import signal


def formant_shift_stft(
    x: np.ndarray,
    sr: int,
    *,
    shift: float,
    n_fft: int = 1024,
    hop: int = 256,
) -> np.ndarray:
    """
    Coarse formant shift by warping magnitude along frequency (shift>1 pulls energy up = brighter).
    Phase from original STFT for stability; OLA synthesis.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.size
    if n < n_fft or abs(shift - 1.0) < 0.005:
        return x.copy()
    shift = float(np.clip(shift, 0.82, 1.22))
    win = signal.windows.hann(n_fft, sym=False)
    out = np.zeros(n, dtype=np.float64)
    norm = np.zeros(n, dtype=np.float64)
    n_bins = n_fft // 2 + 1
    freqs = np.linspace(0.0, 1.0, n_bins)
    for start in range(0, n - n_fft + 1, hop):
        frame = x[start : start + n_fft] * win
        spec = np.fft.rfft(frame, n=n_fft)
        mag = np.abs(spec)
        ph = np.angle(spec)
        new_mag = np.interp(freqs, freqs / shift, mag, left=mag[0], right=mag[-1])
        yf = np.fft.irfft(new_mag * np.exp(1j * ph), n=n_fft)
        out[start : start + n_fft] += yf * win
        norm[start : start + n_fft] += win * win
    norm = np.maximum(norm, 1e-8)
    return (out / norm).astype(np.float64)
