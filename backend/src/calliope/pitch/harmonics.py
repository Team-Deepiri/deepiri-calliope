from __future__ import annotations

import numpy as np


def harmonic_weighted_energy(mag: np.ndarray, sr: int, n_fft: int, f0_hz: float, n_harm: int = 8) -> float:
    """Sum of magnitude bins near integer harmonics of f0 (coarse, for voicing / timbre hints)."""
    if f0_hz <= 0 or mag.size == 0:
        return 0.0
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    total = 0.0
    for h in range(1, n_harm + 1):
        fh = f0_hz * h
        idx = int(np.argmin(np.abs(freqs - fh)))
        w = 3
        lo = max(0, idx - w)
        hi = min(len(mag), idx + w + 1)
        total += float(np.sum(mag[lo:hi]))
    return total
