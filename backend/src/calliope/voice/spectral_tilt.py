from __future__ import annotations

import numpy as np


def spectral_tilt_db_per_oct(mag: np.ndarray, freqs: np.ndarray, lo_hz: float = 300.0, hi_hz: float = 3400.0) -> float:
    """Regression slope of log-magnitude vs log-frequency in band (dB/oct approx)."""
    m = np.maximum(np.asarray(mag, dtype=np.float64), 1e-12)
    f = np.asarray(freqs, dtype=np.float64)
    mask = (f >= lo_hz) & (f <= hi_hz)
    if np.sum(mask) < 4:
        return 0.0
    lf = np.log2(f[mask])
    lm = np.log10(m[mask])
    coef = np.polyfit(lf, lm, 1)[0]
    return float(20.0 * coef)
