from __future__ import annotations

import numpy as np


def onset_peak_indices(flux: np.ndarray, *, pre_max: int = 3, post_max: int = 3, delta: float = 0.05) -> np.ndarray:
    """
    Simple peak-picking on a novelty curve (e.g. spectral flux).
    Returns frame indices (into `flux`) of detected onsets.
    """
    x = np.asarray(flux, dtype=np.float64).ravel()
    if x.size < 2 * (pre_max + post_max) + 1:
        return np.array([], dtype=np.int64)
    peaks: list[int] = []
    for i in range(pre_max, x.size - post_max):
        local_max = np.max(x[i - pre_max : i + post_max + 1])
        if x[i] >= local_max - 1e-12 and x[i] > delta and x[i] > x[i - 1] and x[i] >= x[i + 1]:
            peaks.append(i)
    return np.array(peaks, dtype=np.int64)
