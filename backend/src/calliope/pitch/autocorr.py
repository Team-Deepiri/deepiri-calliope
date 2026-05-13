from __future__ import annotations

import numpy as np


def autocorr_fundamental_hz(frame: np.ndarray, sr: int, fmin: float = 50.0, fmax: float = 2000.0) -> float:
    """Naive autocorrelation peak for single frame; returns Hz or 0 if unvoiced."""
    x = np.asarray(frame, dtype=np.float64) - np.mean(frame)
    n = len(x)
    if n < 4:
        return 0.0
    ac = np.correlate(x, x, mode="full")[n - 1 :]
    lag_min = max(1, int(sr / fmax))
    lag_max = min(n - 1, int(sr / fmin))
    if lag_max <= lag_min:
        return 0.0
    region = ac[lag_min:lag_max]
    if len(region) < 2:
        return 0.0
    peak = lag_min + int(np.argmax(region))
    if peak <= 0:
        return 0.0
    return float(sr / peak)
