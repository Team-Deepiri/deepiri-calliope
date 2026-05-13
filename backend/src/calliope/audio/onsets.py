from __future__ import annotations

import numpy as np


def spectral_flux_series(mag: np.ndarray) -> np.ndarray:
    """Positive first-difference flux across frequency bins per frame."""
    m = np.asarray(mag, dtype=np.float64)
    if m.shape[0] < 2:
        return np.zeros(max(0, m.shape[0] - 1))
    diff = np.diff(m, axis=0)
    diff = np.maximum(diff, 0.0)
    return np.sum(diff, axis=1)
