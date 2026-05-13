from __future__ import annotations

import numpy as np


def feedback_delay_mono(x: np.ndarray, sr: float, *, time_ms: float, feedback: float, wet: float) -> np.ndarray:
    """Simple feedback delay line; returns wet tap only (same length as x)."""
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.size
    if n == 0 or wet <= 0:
        return np.zeros(0, dtype=np.float64)
    d = int(np.clip(time_ms * 1e-3 * sr, 1, n - 1))
    fb = float(np.clip(feedback, 0.0, 0.85))
    wet = float(np.clip(wet, 0.0, 0.55))
    buf = np.zeros(d, dtype=np.float64)
    out = np.zeros(n, dtype=np.float64)
    for i in range(n):
        rd = float(buf[0])
        buf[:-1] = buf[1:]
        buf[-1] = x[i] + fb * rd
        out[i] = rd
    return (wet * out).astype(np.float64)
