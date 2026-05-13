from __future__ import annotations

import numpy as np


def peak_normalize(y: np.ndarray, peak: float = 0.99) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size == 0:
        return y.copy()
    m = float(np.max(np.abs(y))) + 1e-18
    return y * (peak / m)


def rms_target_normalize(y: np.ndarray, target_dbfs: float = -18.0) -> np.ndarray:
    from calliope.mathx.db import dbfs_from_rms

    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size == 0:
        return y.copy()
    rms = float(np.sqrt(np.mean(y * y) + 1e-18))
    cur = dbfs_from_rms(rms)
    gain_db = target_dbfs - cur
    g = float(10 ** (gain_db / 20.0))
    return y * g
