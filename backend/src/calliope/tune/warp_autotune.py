from __future__ import annotations

import numpy as np
from scipy.ndimage import uniform_filter1d


def warp_pitch_map(
    y: np.ndarray,
    sr: int,
    f0_hz: np.ndarray,
    target_hz: np.ndarray,
    *,
    hop: int,
    frame: int,
    strength: float = 1.0,
    smooth_bins: int = 5,
) -> np.ndarray:
    """
    Time-domain pitch correction toward per-frame targets using a smoothed read-pointer warp.

    For each output sample i, reads y at cumulative position built from local ratio
    (f0/target)^strength (voiced) or 1 (unvoiced). Pointer is normalized to span the
    full input so output length matches input (monotone warp + linear interpolation).

    This is not PSOLA; it is a fast, artifact-aware educational corrector that pairs
    well with YIN + scale targets from ``retune_contour_linear``.
    """
    y = np.asarray(y, dtype=np.float64).ravel()
    n = y.size
    if n == 0 or f0_hz.size == 0:
        return y.copy()
    strength = float(np.clip(strength, 0.0, 1.0))
    f0 = np.asarray(f0_hz, dtype=np.float64).ravel()
    tgt = np.asarray(target_hz, dtype=np.float64).ravel()
    m = min(f0.size, tgt.size)
    f0, tgt = f0[:m], tgt[:m]
    centers = np.arange(m, dtype=np.float64) * hop + (frame / 2.0)
    ratio = np.ones(m, dtype=np.float64)
    for i in range(m):
        if f0[i] > 1.0 and tgt[i] > 1.0:
            r = f0[i] / tgt[i]
            ratio[i] = float(r**strength)
    if smooth_bins > 1:
        k = min(smooth_bins, m)
        ratio = uniform_filter1d(ratio, size=k, mode="nearest")
    ratio = np.clip(ratio, 0.5, 2.0)
    r_t = np.interp(np.arange(n, dtype=np.float64), centers, ratio, left=ratio[0], right=ratio[-1])
    read = np.concatenate([[0.0], np.cumsum(r_t[:-1])])
    mx = float(read[-1]) if read.size else 0.0
    if mx <= 1e-9:
        return y.copy()
    read = read * ((n - 1) / mx)
    xi = np.arange(n, dtype=np.float64)
    return np.interp(read, xi, y, left=0.0, right=0.0).astype(np.float64)


def blend_dry_wet(dry: np.ndarray, wet: np.ndarray, wet_amount: float) -> np.ndarray:
    a = float(np.clip(wet_amount, 0.0, 1.0))
    return ((1.0 - a) * dry + a * wet).astype(np.float64)
