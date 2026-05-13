from __future__ import annotations

import numpy as np


def pitch_shift_interpolate(y: np.ndarray, semitones: float) -> np.ndarray:
    """Naive pitch shift via resampling (duration changes). Quality: demo only."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size == 0:
        return y.copy()
    ratio = float(2.0 ** (semitones / 12.0))
    n_out = max(1, int(len(y) / ratio))
    t_old = np.arange(len(y), dtype=np.float64)
    t_new = np.linspace(0.0, len(y) - 1.0, n_out)
    shifted = np.interp(t_new, t_old, y)
    # resample back to original length
    t_back = np.linspace(0.0, len(shifted) - 1.0, len(y))
    return np.interp(t_back, np.arange(len(shifted), dtype=np.float64), shifted)
