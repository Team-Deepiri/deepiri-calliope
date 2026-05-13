from __future__ import annotations

import numpy as np

from calliope.voice.dynamics import envelope_follower
def noise_gate(x: np.ndarray, sr: float, *, threshold_db: float = -48.0, attack_ms: float = 1.0, release_ms: float = 80.0, floor: float = 0.12) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0:
        return x.copy()
    env = envelope_follower(np.abs(x), sr, attack_ms, release_ms)
    eps = 1e-12
    env_db = 20.0 * np.log10(np.maximum(env, eps))
    # smooth gate curve
    depth = np.clip((threshold_db - env_db) / 12.0, 0.0, 1.0)
    g = floor + (1.0 - floor) * (1.0 - depth)
    return (x * g).astype(np.float64)
