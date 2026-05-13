from __future__ import annotations

import numpy as np


def true_peak_estimate(y: np.ndarray, oversample: int = 4) -> float:
    """Oversampled peak magnitude (educational; not ITU-R BS.1770 true-peak)."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size == 0:
        return 0.0
    if oversample <= 1:
        return float(np.max(np.abs(y)))
    t_old = np.arange(len(y), dtype=np.float64)
    t_new = np.linspace(0.0, len(y) - 1.0, len(y) * oversample)
    zi = np.interp(t_new, t_old, y)
    return float(np.max(np.abs(zi)))
