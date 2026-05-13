from __future__ import annotations

import numpy as np


def cubic_interpolate(x: float, x0: float, x1: float, y0: float, y1: float, m0: float, m1: float) -> float:
    """Hermite cubic between (x0,y0) and (x1,y1) with endpoint tangents m0,m1."""
    if x1 == x0:
        return y0
    t = (x - x0) / (x1 - x0)
    h = x1 - x0
    t2, t3 = t * t, t * t * t
    h00 = 2 * t3 - 3 * t2 + 1
    h10 = t3 - 2 * t2 + t
    h01 = -2 * t3 + 3 * t2
    h11 = t3 - t2
    return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1


def linear_resample_1d(y: np.ndarray, new_len: int) -> np.ndarray:
    """1-D linear resample to new_len samples (inclusive endpoints)."""
    if new_len < 2:
        return np.array([float(np.mean(y))]) if len(y) else y
    x_old = np.linspace(0.0, 1.0, num=len(y))
    x_new = np.linspace(0.0, 1.0, num=new_len)
    return np.interp(x_new, x_old, np.asarray(y, dtype=np.float64))
