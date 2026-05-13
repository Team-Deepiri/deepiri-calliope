"""Tuning, scales, and autotune-style pitch mapping."""

from calliope.tune.autotune_simple import retune_contour_linear
from calliope.tune.pitch_shift import pitch_shift_interpolate
from calliope.tune.retune import smooth_snap_midi_contour
from calliope.tune.scales import major_scale_midi, minor_scale_midi
from calliope.tune.snap import nearest_scale_degree_hz

__all__ = [
    "retune_contour_linear",
    "pitch_shift_interpolate",
    "smooth_snap_midi_contour",
    "major_scale_midi",
    "minor_scale_midi",
    "nearest_scale_degree_hz",
]
