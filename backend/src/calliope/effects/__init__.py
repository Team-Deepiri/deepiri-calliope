"""Effects module for advanced audio processing."""

from calliope.effects.modulation import (
    Vocoder,
    RingModulator,
    AMModulator,
    DimensionalModulator,
    Flanger,
    Phaser,
    Tremolo,
    Chorus,
)
from calliope.effects.grain import (
    GrainCloud,
    FormantGrain,
    ScatterEffect,
    TextureSynthesis,
)
from calliope.effects.spectral import (
    SpectralProcessor,
    SpectralEQ,
    SpectralGate,
    SpectralCompress,
    SpectralReverse,
    SpectralRobotize,
    SpectralFreeze,
    SpectralShift,
)

__all__ = [
    "Vocoder",
    "RingModulator",
    "AMModulator",
    "DimensionalModulator",
    "Flanger",
    "Phaser",
    "Tremolo",
    "Chorus",
    "GrainCloud",
    "FormantGrain",
    "ScatterEffect",
    "TextureSynthesis",
    "SpectralProcessor",
    "SpectralEQ",
    "SpectralGate",
    "SpectralCompress",
    "SpectralReverse",
    "SpectralRobotize",
    "SpectralFreeze",
    "SpectralShift",
]