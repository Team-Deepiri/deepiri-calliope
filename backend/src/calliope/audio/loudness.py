from __future__ import annotations

import numpy as np

from calliope.mathx.db import dbfs_from_rms


def a_weighting_approx(f: np.ndarray) -> np.ndarray:
    """IEC 61672-1 A-weighting magnitude approximation (dB), for f in Hz."""
    f = np.maximum(np.asarray(f, dtype=np.float64), 1.0)
    c = 12200.0**2
    f2 = f * f
    f4 = f2 * f2
    num = c * f4
    den = (f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + c)
    ra = num / np.maximum(den, 1e-18)
    ra_unweighted = 1.2589047  # 1.25892541179 — 10^(1/20) at 1kHz reference
    return 20.0 * np.log10(np.maximum(ra / ra_unweighted, 1e-18))


def weighted_rms_db(y: np.ndarray, sr: int, n_fft: int = 1024) -> float:
    """Single broadband A-weighted-ish level from first frame spectrum (coarse)."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size < n_fft:
        y = np.pad(y, (0, n_fft - y.size))
    win = np.hanning(n_fft)
    frame = y[:n_fft] * win
    mag = np.abs(np.fft.rfft(frame, n=n_fft))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    w = a_weighting_approx(freqs)
    weighted = mag * (10 ** (w / 40.0))  # crude: treat as amplitude weight
    rms = float(np.sqrt(np.mean(weighted**2) + 1e-18))
    return float(dbfs_from_rms(rms))
