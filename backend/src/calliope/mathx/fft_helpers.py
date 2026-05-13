from __future__ import annotations

import numpy as np


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p <<= 1
    return p


def rfft_mag_phase(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Single-sided magnitude and phase of real FFT."""
    spec = np.fft.rfft(x)
    return np.abs(spec), np.angle(spec)


def band_energy_ratio(mag: np.ndarray, low_bin: int, high_bin: int) -> float:
    """Fraction of energy in [low_bin, high_bin] inclusive."""
    m = np.asarray(mag, dtype=np.float64) ** 2
    lo, hi = max(0, low_bin), min(len(m) - 1, high_bin)
    num = float(np.sum(m[lo : hi + 1]))
    den = float(np.sum(m)) + 1e-18
    return num / den
