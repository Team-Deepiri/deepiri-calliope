from __future__ import annotations

import numpy as np


def one_pole_lowpass(x: np.ndarray, sr: float, cutoff_hz: float) -> np.ndarray:
    """Simple one-pole IIR lowpass (warmth / anti-alias toy)."""
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0 or cutoff_hz <= 0:
        return x.copy()
    rc = 1.0 / (2.0 * np.pi * cutoff_hz)
    dt = 1.0 / sr
    alpha = dt / (rc + dt)
    y = np.zeros_like(x)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = y[i - 1] + alpha * (x[i] - y[i - 1])
    return y


def preemphasis(x: np.ndarray, coeff: float = 0.97) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size < 2:
        return x.copy()
    return np.concatenate([[x[0]], x[1:] - coeff * x[:-1]])
