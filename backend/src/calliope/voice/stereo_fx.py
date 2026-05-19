from __future__ import annotations

import numpy as np


def stereo_widen_mono(
    mono: np.ndarray,
    sr: float,
    *,
    width: float,
    haas_ms: float,
    chorus_amount: float = 0.0,
) -> np.ndarray:
    """
    Mono in → stereo (n,2). `width` 0=dual-mono, 1=full side emphasis; `haas_ms` micro-delay on right.
    `chorus_amount` 0–1 applies subtle LFO width modulation on the right channel (doubles / motion).
    """
    m = np.asarray(mono, dtype=np.float64).ravel()
    n = m.size
    if n == 0:
        return np.zeros((0, 2), dtype=np.float64)
    w = float(np.clip(width, 0.0, 1.0))
    mid = m
    hp = m - np.concatenate([[m[0]], m[:-1]])
    side = hp * w * 0.55
    L = mid + side
    R = mid - side
    delay = max(0, int(haas_ms * 1e-3 * sr))
    if delay > 0 and delay < n:
        R2 = np.zeros_like(R)
        R2[delay:] = R[:-delay]
        R = R2
    ch = float(np.clip(chorus_amount, 0.0, 1.0))
    if ch > 0.02 and n > 8:
        t = np.arange(n, dtype=np.float64) / float(sr)
        lfo = 1.0 + 0.048 * ch * np.sin(2.0 * np.pi * 2.65 * t)
        R = R * lfo
    out = np.column_stack([L, R])
    e0 = float(np.sqrt(np.mean(m * m)) + 1e-9)
    e1 = float(np.sqrt(np.mean(out[:, 0] ** 2 + out[:, 1] ** 2) / 2.0) + 1e-9)
    return (out * (e0 / e1)).astype(np.float64)
