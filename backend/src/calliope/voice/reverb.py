from __future__ import annotations

import numpy as np


def schroeder_reverb_mono(x: np.ndarray, sr: float, *, wet: float, t60: float) -> np.ndarray:
    """
    Schroeder-style mono reverb tail (wet only): parallel feedback combs, summed.
    Caller mixes: `y = dry + schroeder_reverb_mono(...)`.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.size
    if n == 0 or wet <= 0:
        return np.zeros(0, dtype=np.float64)
    wet = float(np.clip(wet, 0.0, 0.5))
    t60 = float(np.clip(t60, 0.1, 1.4))
    scale = float(np.clip(t60 / 0.35, 0.75, 1.35))
    d_ms = np.array([29.7, 37.1, 41.1, 43.7], dtype=np.float64) * scale
    d = np.maximum((d_ms * 1e-3 * sr).astype(np.int64), 8)
    g = np.clip(10.0 ** (-3.0 * d.astype(np.float64) / (t60 * sr)), 0.0, 0.93)
    comb_sum = np.zeros(n, dtype=np.float64)
    for di, gi in zip(d, g, strict=True):
        ring = np.zeros(int(di), dtype=np.float64)
        out = np.zeros(n, dtype=np.float64)
        for i in range(n):
            yd = float(ring[0])
            y = float(x[i]) + gi * yd
            ring[:-1] = ring[1:]
            ring[-1] = y
            out[i] = y
        comb_sum += out * 0.24
    return (wet * comb_sum).astype(np.float64)
