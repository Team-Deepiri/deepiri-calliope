from __future__ import annotations

import numpy as np


def band_energy_ratios(mag: np.ndarray, freqs: np.ndarray, bands: list[tuple[float, float]]) -> list[float]:
    """Fraction of total energy in each (lo, hi) Hz band."""
    m = np.asarray(mag, dtype=np.float64)
    f = np.asarray(freqs, dtype=np.float64)
    e = m * m
    tot = float(np.sum(e)) + 1e-18
    out: list[float] = []
    for i, (lo, hi) in enumerate(bands):
        if i < len(bands) - 1:
            mask = (f >= lo) & (f < hi)
        else:
            mask = (f >= lo) & (f <= hi)
        out.append(float(np.sum(e[mask]) / tot))
    return out
