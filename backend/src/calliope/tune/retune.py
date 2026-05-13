from __future__ import annotations

import numpy as np


def smooth_snap_midi_contour(midi: np.ndarray, strength: float = 0.35, window: int = 3) -> np.ndarray:
    """Blend each frame toward local median MIDI (reduces vibrato warble before hard snap)."""
    x = np.asarray(midi, dtype=np.float64).copy()
    if x.size == 0:
        return x
    k = max(1, window // 2)
    out = np.zeros_like(x)
    for i in range(len(x)):
        lo = max(0, i - k)
        hi = min(len(x), i + k + 1)
        med = float(np.median(x[lo:hi]))
        out[i] = (1.0 - strength) * x[i] + strength * med
    return out


def retune_ratio_series(f0_hz: np.ndarray, target_hz: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """Per-frame frequency ratio target/f0 (for PSOLA / phase-vocoder frontends)."""
    f0 = np.asarray(f0_hz, dtype=np.float64)
    t = np.asarray(target_hz, dtype=np.float64)
    out = np.ones_like(f0)
    mask = f0 > eps
    out[mask] = t[mask] / f0[mask]
    return out
