from __future__ import annotations

import numpy as np


def hann_window(n: int) -> np.ndarray:
    if n < 1:
        return np.array([], dtype=np.float64)
    return 0.5 - 0.5 * np.cos(2.0 * np.pi * np.arange(n, dtype=np.float64) / n)


def hamming_window(n: int) -> np.ndarray:
    if n < 1:
        return np.array([], dtype=np.float64)
    return 0.54 - 0.46 * np.cos(2.0 * np.pi * np.arange(n, dtype=np.float64) / (n - 1 if n > 1 else 1))
