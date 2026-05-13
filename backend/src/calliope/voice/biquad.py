"""High-pass and band EQ helpers built on scipy SOS (stable, well-conditioned)."""

from __future__ import annotations

import numpy as np
from scipy import signal


def sos_highpass(sr: float, cutoff_hz: float, order: int = 2) -> np.ndarray:
    return signal.butter(order, cutoff_hz, btype="highpass", fs=sr, output="sos")


def sos_presence_peak(sr: float, f0: float, q: float, gain_db: float) -> np.ndarray:
    """Peaking EQ section; `gain_db` is boost (positive) or cut (negative)."""
    b, a = signal.iirpeak(f0, q, fs=sr)
    lin = 10.0 ** (gain_db / 20.0)
    b = np.asarray(b, dtype=np.float64) * lin
    return signal.tf2sos(b, a)


def sos_bandpass(sr: float, low_hz: float, high_hz: float, order: int = 2) -> np.ndarray:
    hi = min(high_hz, 0.48 * sr)
    lo = max(low_hz, 20.0)
    if lo >= hi:
        lo, hi = hi * 0.5, hi
    return signal.butter(order, [lo, hi], btype="band", fs=sr, output="sos")


def sosfilt_zero_phase(sos: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Zero-phase (forward-backward) filtering for musical EQ moves."""
    return signal.sosfiltfilt(sos, np.asarray(x, dtype=np.float64))
