from __future__ import annotations

import numpy as np

from calliope.pitch.hz_cents import hz_to_midi, midi_to_hz


def nearest_scale_degree_hz(f_hz: float, scale_midi: list[int], *, octaves: int = 4, a4: float = 440.0) -> float:
    """Snap positive frequency to nearest MIDI pitch whose pitch-class is in `scale_midi` (any octave)."""
    if f_hz <= 0:
        return f_hz
    m = hz_to_midi(f_hz)
    if np.isnan(m):
        return f_hz
    pcs = sorted({int(round(s)) % 12 for s in scale_midi})
    if not pcs:
        return f_hz
    candidates: list[float] = []
    base = int(round(m)) // 12 * 12
    for o in range(-octaves, octaves + 1):
        for pc in pcs:
            candidates.append(float(base + o * 12 + pc))
    best = min(candidates, key=lambda mm: abs(mm - m))
    return midi_to_hz(best)
