from __future__ import annotations

import numpy as np

from calliope.pitch.hz_cents import hz_to_midi, midi_to_hz
from calliope.tune.retune import retune_ratio_series, smooth_snap_midi_contour
from calliope.tune.snap import nearest_scale_degree_hz


def retune_contour_linear(
    f0_hz: np.ndarray,
    *,
    scale_midi: list[int] | None = None,
    smooth: float = 0.25,
    pull: float = 0.85,
    a4: float = 440.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Map a frame-wise F0 contour toward equal temperament or scale-snapped targets.
    Returns (target_hz, ratio target/f0); unvoiced frames keep ratio 1.
    """
    f0 = np.asarray(f0_hz, dtype=np.float64).ravel()
    if f0.size == 0:
        return f0.copy(), np.array([], dtype=np.float64)
    target = np.zeros_like(f0)
    for i, f in enumerate(f0):
        if f <= 0:
            target[i] = 0.0
            continue
        m = hz_to_midi(f)
        if np.isnan(m):
            target[i] = 0.0
            continue
        if scale_midi is None:
            target[i] = midi_to_hz(float(round(m)))
        else:
            target[i] = nearest_scale_degree_hz(f, scale_midi, a4=a4)
    if smooth > 0 and np.any(target > 0):
        tm = np.array([hz_to_midi(t) if t > 0 else np.nan for t in target], dtype=np.float64)
        if np.any(np.isfinite(tm)):
            fill = float(np.nanmean(tm))
            sm = smooth_snap_midi_contour(np.nan_to_num(tm, nan=fill), strength=smooth, window=5)
            for i in range(len(f0)):
                if f0[i] > 0 and target[i] > 0:
                    target[i] = (1.0 - pull) * f0[i] + pull * midi_to_hz(float(sm[i]))
    ratios = retune_ratio_series(f0, target)
    ratios[f0 <= 0] = 1.0
    return target, ratios
