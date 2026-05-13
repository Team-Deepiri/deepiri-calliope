from __future__ import annotations

import numpy as np


def hz_to_midi(f: float) -> float:
    if f <= 0:
        return float("nan")
    return 69.0 + 12.0 * np.log2(f / 440.0)


def midi_to_hz(m: float) -> float:
    return float(440.0 * (2.0 ** ((m - 69.0) / 12.0)))


def cents_between(f0: float, f1: float) -> float:
    if f0 <= 0 or f1 <= 0:
        return 0.0
    return float(1200.0 * np.log2(f1 / f0))


def snap_hz_equal_temperament(f: float, *, a4: float = 440.0) -> float:
    """Snap positive Hz to nearest ET semitone under A4 reference."""
    if f <= 0:
        return f
    m = 69.0 + 12.0 * np.log2(f / a4)
    m_snap = round(m)
    return float(a4 * (2.0 ** ((m_snap - 69.0) / 12.0)))
