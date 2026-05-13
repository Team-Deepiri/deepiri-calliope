from __future__ import annotations

import numpy as np


def spectral_centroid(mag: np.ndarray, freqs: np.ndarray) -> float:
    m = np.asarray(mag, dtype=np.float64)
    f = np.asarray(freqs, dtype=np.float64)
    if m.size == 0 or f.shape != m.shape:
        return 0.0
    s = float(np.sum(m))
    if s <= 1e-18:
        return 0.0
    return float(np.sum(f * m) / s)


def spectral_rolloff(mag: np.ndarray, freqs: np.ndarray, rolloff: float = 0.85) -> float:
    """Frequency below which `rolloff` fraction of spectral energy is contained."""
    m = np.asarray(mag, dtype=np.float64)
    f = np.asarray(freqs, dtype=np.float64)
    if m.size == 0:
        return 0.0
    c = np.cumsum(m)
    thr = rolloff * c[-1]
    idx = int(np.searchsorted(c, thr))
    idx = min(max(idx, 0), len(f) - 1)
    return float(f[idx])
