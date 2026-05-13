from __future__ import annotations

import numpy as np


def stereo_widen_mono(mono: np.ndarray, sr: float, *, width: float, haas_ms: float) -> np.ndarray:
    """
    Mono in → stereo (n,2). `width` 0=dual-mono, 1=full side emphasis; `haas_ms` micro-delay on right.
    """
    m = np.asarray(mono, dtype=np.float64).ravel()
    n = m.size
    if n == 0:
        return np.zeros((0, 2), dtype=np.float64)
    w = float(np.clip(width, 0.0, 1.0))
    mid = m
    # synthetic side from high-passed copy for width without full M/S encode
    hp = m - np.concatenate([[m[0]], m[:-1]])  # crude HP
    side = hp * w * 0.55
    L = mid + side
    R = mid - side
    delay = max(0, int(haas_ms * 1e-3 * sr))
    if delay > 0 and delay < n:
        R2 = np.zeros_like(R)
        R2[delay:] = R[:-delay]
        R = R2
    out = np.column_stack([L, R])
    # energy normalize roughly
    e0 = float(np.sqrt(np.mean(m * m)) + 1e-9)
    e1 = float(np.sqrt(np.mean(out[:, 0] ** 2 + out[:, 1] ** 2) / 2.0) + 1e-9)
    return (out * (e0 / e1)).astype(np.float64)
