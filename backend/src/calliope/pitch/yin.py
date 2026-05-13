from __future__ import annotations

import numpy as np


def _difference_function(x: np.ndarray, tau_max: int) -> np.ndarray:
    """YIN difference function d(tau), tau = 0 .. tau_max-1 (vectorized inner loops)."""
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    d = np.zeros(tau_max, dtype=np.float64)
    x2 = x * x
    c = np.concatenate([[0.0], np.cumsum(x2)])
    for tau in range(1, min(tau_max, n)):
        sum_x2 = c[n - tau] - c[0]
        sum_x2_shift = c[n] - c[tau]
        cross = float(np.dot(x[: n - tau], x[tau:n]))
        d[tau] = sum_x2 + sum_x2_shift - 2.0 * cross
    return d


def _cumulative_mean_normalized_difference(d: np.ndarray) -> np.ndarray:
    s = np.maximum(np.cumsum(d), 1e-18)
    taus = np.arange(len(d), dtype=np.float64)
    out = d * taus / s
    out[0] = 1.0
    return out


def yin_track_frame(frame: np.ndarray, sr: int, *, fmin: float = 50.0, fmax: float = 2000.0, thresh: float = 0.15) -> float:
    """Return fundamental Hz for one frame using YIN; 0 if none."""
    x = np.asarray(frame, dtype=np.float64)
    n = len(x)
    if n < 8:
        return 0.0
    tau_max = min(n // 2, int(sr / fmin) + 2)
    tau_min = max(2, int(sr / fmax))
    if tau_max <= tau_min + 2:
        return 0.0
    d = _difference_function(x, tau_max)
    cmndf = _cumulative_mean_normalized_difference(d)
    search = cmndf[tau_min:tau_max]
    below = np.where(search < thresh)[0]
    if len(below) == 0:
        tau = tau_min + int(np.argmin(search))
    else:
        tau = tau_min + int(below[0])
    if tau <= 0:
        return 0.0
    return float(sr / tau)


def yin_track_series(
    y: np.ndarray,
    sr: int,
    *,
    frame: int = 2048,
    hop: int = 512,
    fmin: float = 50.0,
    fmax: float = 2000.0,
    thresh: float = 0.15,
) -> np.ndarray:
    """F0 contour (Hz), one value per hop-aligned frame."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if len(y) < frame:
        y = np.pad(y, (0, frame - len(y)))
    out: list[float] = []
    for start in range(0, len(y) - frame + 1, hop):
        f0 = yin_track_frame(y[start : start + frame], sr, fmin=fmin, fmax=fmax, thresh=thresh)
        out.append(f0)
    return np.array(out, dtype=np.float64)
