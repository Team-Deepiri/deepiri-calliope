from __future__ import annotations

import numpy as np


def rms_envelope(y: np.ndarray, frame: int, hop: int) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    out: list[float] = []
    for start in range(0, max(1, len(y) - frame + 1), hop):
        seg = y[start : start + frame]
        out.append(float(np.sqrt(np.mean(seg * seg) + 1e-18)))
    return np.array(out, dtype=np.float64)
