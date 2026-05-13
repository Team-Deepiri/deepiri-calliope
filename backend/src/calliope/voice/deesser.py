from __future__ import annotations

import numpy as np
from scipy import signal

from calliope.voice.dynamics import envelope_follower


def deesser_mono(
    x: np.ndarray,
    sr: float,
    *,
    amount: float = 0.55,
    band_low_hz: float = 4_000.0,
    band_high_hz: float = 10_000.0,
    attack_ms: float = 1.5,
    release_ms: float = 40.0,
) -> np.ndarray:
    """
    Split-band de-esser: when sibilance-band envelope is hot, duck full-band mix toward dry.
    `amount` in [0,1] scales reduction depth.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0 or amount <= 0:
        return x.copy()
    hi = min(band_high_hz, 0.45 * sr)
    lo = min(band_low_hz, hi * 0.5)
    sos = signal.butter(2, [lo, hi], btype="band", fs=sr, output="sos")
    sib = signal.sosfilt(sos, x)
    env = envelope_follower(np.abs(sib), sr, attack_ms, release_ms)
    env_n = env / (np.max(env) + 1e-9)
    duck = np.clip(amount * (env_n**0.7), 0.0, 0.85)
    return (x * (1.0 - duck)).astype(np.float64)
