from __future__ import annotations

import numpy as np


def envelope_follower(abs_x: np.ndarray, sr: float, attack_ms: float, release_ms: float) -> np.ndarray:
    """Peak envelope follower on |x|."""
    x = np.maximum(np.asarray(abs_x, dtype=np.float64).ravel(), 0.0)
    n = x.size
    if n == 0:
        return x
    atk = float(np.exp(-1.0 / max(1e-6, attack_ms * 1e-3 * sr)))
    rel = float(np.exp(-1.0 / max(1e-6, release_ms * 1e-3 * sr)))
    env = np.zeros(n, dtype=np.float64)
    env[0] = x[0]
    for i in range(1, n):
        coeff = atk if x[i] > env[i - 1] else rel
        env[i] = x[i] + coeff * (env[i - 1] - x[i])
    return env


def compressor_mono(
    x: np.ndarray,
    sr: float,
    *,
    threshold_db: float = -22.0,
    ratio: float = 3.0,
    attack_ms: float = 8.0,
    release_ms: float = 120.0,
    makeup_db: float = 0.0,
    knee_width_db: float = 6.0,
) -> np.ndarray:
    """Feed-forward compressor with soft knee in log domain."""
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0:
        return x.copy()
    eps = 1e-12
    env = envelope_follower(np.abs(x), sr, attack_ms, release_ms)
    env_db = 20.0 * np.log10(np.maximum(env, eps))
    over = env_db - threshold_db
    knee = max(knee_width_db, 1e-6)
    soft = np.where(
        over < -knee / 2.0,
        0.0,
        np.where(
            over > knee / 2.0,
            over,
            (over + knee / 2.0) ** 2 / (2.0 * knee),
        ),
    )
    reduction_db = np.where(soft > 0, soft * (1.0 - 1.0 / ratio), 0.0)
    gain_db = -reduction_db + makeup_db
    g = 10.0 ** (gain_db / 20.0)
    return (x * g).astype(np.float64)


def soft_limiter(x: np.ndarray, threshold: float = 0.92, knee: float = 0.08) -> np.ndarray:
    """Smooth brickwall-ish limiter using tanh around threshold."""
    eps = 1e-12
    x = np.asarray(x, dtype=np.float64).ravel()
    if x.size == 0:
        return x.copy()
    s = float(np.max(np.abs(x)) + eps)
    if s <= threshold:
        return x.copy()
    scale = threshold / s
    y = x * scale
    over = np.abs(y) - (threshold - knee)
    mask = over > 0
    out = y.copy()
    out[mask] = np.sign(y[mask]) * ((threshold - knee) + knee * np.tanh(over[mask] / knee))
    return out.astype(np.float64)
