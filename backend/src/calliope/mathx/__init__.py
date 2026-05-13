"""Numerical helpers for DSP and music (dB, interpolation, small FFT utilities)."""

from calliope.mathx.db import db_to_linear, linear_to_db
from calliope.mathx.interpolation import cubic_interpolate, linear_resample_1d
from calliope.mathx.optimization import golden_section_minimize
from calliope.mathx.stats import spectral_centroid, spectral_rolloff

__all__ = [
    "db_to_linear",
    "linear_to_db",
    "cubic_interpolate",
    "linear_resample_1d",
    "golden_section_minimize",
    "spectral_centroid",
    "spectral_rolloff",
]
