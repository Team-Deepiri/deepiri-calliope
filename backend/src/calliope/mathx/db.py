from __future__ import annotations

import numpy as np


def linear_to_db(x: np.ndarray, floor: float = 1e-12) -> np.ndarray:
    """Convert linear amplitude / power to dB (10·log10 for power-like quantities)."""
    x = np.maximum(np.asarray(x, dtype=np.float64), floor)
    return 10.0 * np.log10(x)


def db_to_linear(db: np.ndarray) -> np.ndarray:
    return np.power(10.0, np.asarray(db, dtype=np.float64) / 10.0)


def dbfs_from_rms(rms: float, ref: float = 1.0, floor: float = 1e-12) -> float:
    """RMS relative to full-scale reference (1.0 peak convention)."""
    r = max(rms, floor)
    return float(20.0 * np.log10(r / ref))
