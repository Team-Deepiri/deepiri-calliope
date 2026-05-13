from __future__ import annotations

import numpy as np


def zero_crossing_rate(y: np.ndarray, frame: int, hop: int) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    out: list[float] = []
    for start in range(0, max(1, len(y) - frame + 1), hop):
        seg = y[start : start + frame]
        zc = np.sum(np.abs(np.diff(np.signbit(seg)))) / (2.0 * max(1, len(seg) - 1))
        out.append(float(zc))
    return np.array(out, dtype=np.float64)
