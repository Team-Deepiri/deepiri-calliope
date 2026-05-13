from __future__ import annotations

import numpy as np


def frame_signal(x: np.ndarray, frame_len: int, hop: int) -> np.ndarray:
    """Shape (n_frames, frame_len) with Hann-style zero-padding at edges optional — simple striding."""
    x = np.asarray(x, dtype=np.float64).ravel()
    if frame_len < 1 or hop < 1:
        raise ValueError("frame_len and hop must be positive")
    n = len(x)
    if n < frame_len:
        x = np.pad(x, (0, frame_len - n))
        n = len(x)
    frames = []
    for start in range(0, n - frame_len + 1, hop):
        frames.append(x[start : start + frame_len])
    if not frames:
        return np.zeros((0, frame_len), dtype=np.float64)
    return np.stack(frames, axis=0)


def unframe_signal(frames: np.ndarray, hop: int, length: int | None = None) -> np.ndarray:
    """Naive OLA with rectangular accumulation; use overlap_add with window for production."""
    if frames.size == 0:
        return np.zeros(0, dtype=np.float64)
    fl = frames.shape[1]
    n_frames = frames.shape[0]
    out_len = (n_frames - 1) * hop + fl if length is None else length
    out = np.zeros(out_len, dtype=np.float64)
    w = np.ones(fl, dtype=np.float64)
    for i in range(n_frames):
        s = i * hop
        out[s : s + fl] += frames[i] * w
    return out
