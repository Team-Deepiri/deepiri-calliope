from __future__ import annotations

import numpy as np

from calliope.mathx.db import dbfs_from_rms


def frame_rms_db(y: np.ndarray, frame: int, hop: int) -> np.ndarray:
    y = np.asarray(y, dtype=np.float64).ravel()
    out: list[float] = []
    for start in range(0, max(1, len(y) - frame + 1), hop):
        seg = y[start : start + frame]
        rms = float(np.sqrt(np.mean(seg * seg) + 1e-18))
        out.append(dbfs_from_rms(rms))
    return np.array(out, dtype=np.float64)


def integrated_rms_db(y: np.ndarray) -> float:
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size == 0:
        return -120.0
    rms = float(np.sqrt(np.mean(y * y) + 1e-18))
    return float(dbfs_from_rms(rms))
