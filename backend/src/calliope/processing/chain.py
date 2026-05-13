from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np


def run_chain(y: np.ndarray, stages: Sequence[Callable[[np.ndarray], np.ndarray]]) -> np.ndarray:
    x = np.asarray(y, dtype=np.float64).copy()
    for fn in stages:
        x = np.asarray(fn(x), dtype=np.float64)
    return x
