from __future__ import annotations

import numpy as np


def one_pole_lowpass(x: np.ndarray, sr: float, fc: float) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0 or fc <= 0:
        return x.copy()
    rc = 1.0 / (2.0 * np.pi * fc)
    dt = 1.0 / sr
    alpha = dt / (rc + dt)
    y = np.zeros_like(x)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = y[i - 1] + alpha * (x[i] - y[i - 1])
    return y


def one_pole_highpass(x: np.ndarray, sr: float, fc: float) -> np.ndarray:
    """One-pole HP via x - LP(x)."""
    return (np.asarray(x, dtype=np.float64).ravel() - one_pole_lowpass(x, sr, fc)).astype(np.float64)


def tone_tilt(x: np.ndarray, sr: float, *, body_db: float, air_db: float) -> np.ndarray:
    """
    Low / high tilt using one-pole splits (musical, cheap).
    `body_db` / `air_db` are small boosts/cuts applied to low / high bands mixed back.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0:
        return x.copy()
    lo = one_pole_lowpass(x, sr, 280.0)
    hi = one_pole_highpass(x, sr, 5200.0)
    mid = x - 0.65 * lo - 0.55 * hi
    g_lo = 10.0 ** (body_db / 20.0)
    g_hi = 10.0 ** (air_db / 20.0)
    return (g_lo * lo + mid + g_hi * hi).astype(np.float64)
