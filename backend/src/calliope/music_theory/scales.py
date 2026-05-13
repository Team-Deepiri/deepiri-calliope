from __future__ import annotations


def chromatic_pc() -> list[int]:
    return list(range(12))


def rotate_mode(mode_intervals: list[int], steps: int) -> list[int]:
    """Rotate a scale pattern (intervals from tonic) by `steps` semitones on the circle."""
    if not mode_intervals:
        return []
    s = steps % 12
    return sorted({(p + s) % 12 for p in mode_intervals})
