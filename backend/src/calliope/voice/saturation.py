from __future__ import annotations

import numpy as np


def tape_tube_saturation(x: np.ndarray, drive: float, mix: float = 1.0) -> np.ndarray:
    """
    Asymmetric soft saturation + tanh ceiling.
    `drive` roughly 0..2.5 (maps from rack 0-100).
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0:
        return x.copy()
    g = 1.0 + 2.2 * float(np.clip(drive, 0.0, 2.5))
    z = x * g
    # mild asymmetry (tube pull)
    pos = np.maximum(z, 0.0)
    neg = np.minimum(z, 0.0)
    shaped = pos / (1.0 + np.abs(pos) ** 1.08) ** (1.0 / 1.08) + 1.12 * neg / (1.0 + np.abs(neg) ** 1.12) ** (1.0 / 1.12)
    wet = np.tanh(shaped * 0.92)
    m = float(np.clip(mix, 0.0, 1.0))
    return ((1.0 - m) * x + m * wet).astype(np.float64)
