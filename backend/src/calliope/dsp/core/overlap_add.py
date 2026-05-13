from __future__ import annotations

import numpy as np


def overlap_add(frames: np.ndarray, hop: int, win: np.ndarray | None = None) -> np.ndarray:
    """Weighted overlap-add (synthesis window). Denominator: sum of window weights per sample."""
    if frames.size == 0:
        return np.zeros(0, dtype=np.float64)
    fl = frames.shape[1]
    n_frames = frames.shape[0]
    w = np.asarray(win, dtype=np.float64) if win is not None else np.ones(fl, dtype=np.float64)
    if len(w) != fl:
        raise ValueError("window length must match frame length")
    out_len = (n_frames - 1) * hop + fl
    out = np.zeros(out_len, dtype=np.float64)
    norm = np.zeros(out_len, dtype=np.float64)
    for i in range(n_frames):
        s = i * hop
        out[s : s + fl] += frames[i] * w
        norm[s : s + fl] += w
    return out / np.maximum(norm, 1e-12)
