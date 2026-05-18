"""Professional instrument library and preset management."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Any, Union

from calliope.audio.synthesizer import SynthConfig, OscillatorConfig, EnvelopeConfig, FilterConfig
from calliope.audio.wavetable import WavetableConfig, create_basic_wavetables
from calliope.audio.granular import GrainParams


@dataclass
class InstrumentPreset:
    name: str
    category: str
    engine: str  # "standard", "wavetable", "granular", "drum"
    config: Any


class InstrumentLibrary:
    """Registry for all built-in instruments and presets."""

    def __init__(self):
        self.presets: Dict[str, InstrumentPreset] = {}
        self._register_defaults()

    def _register_defaults(self):
        # --- Standard Synth Presets ---
        self.register(InstrumentPreset(
            "Analog Lead", "Lead", "standard",
            SynthConfig(
                name="Analog Lead",
                oscillators=[OscillatorConfig("sawtooth", detune_cents=5), OscillatorConfig("square", detune_cents=-5, amplitude=0.5)],
                envelope=EnvelopeConfig(attack=0.01, decay=0.1, sustain=0.7, release=0.2),
                filter=FilterConfig("lowpass", cutoff_freq=2000, resonance=0.5)
            )
        ))

        # --- Wavetable Presets ---
        self.register(InstrumentPreset(
            "Morphing Bass", "Bass", "wavetable",
            {
                "wavetable": create_basic_wavetables(),
                "envelope": EnvelopeConfig(attack=0.05, decay=0.3, sustain=0.4, release=0.2),
                "filter": FilterConfig("lowpass", cutoff_freq=800, resonance=0.4)
            }
        ))

        # --- Granular Presets ---
        self.register(InstrumentPreset(
            "Ethereal Clouds", "Pad", "granular",
            {
                "params": GrainParams(position=0.2, duration=0.15, density=30, jitter=0.05, stereo_spread=0.8),
                "envelope": EnvelopeConfig(attack=1.0, decay=2.0, sustain=0.8, release=2.0)
            }
        ))

    def register(self, preset: InstrumentPreset):
        self.presets[preset.name] = preset

    def get_preset(self, name: str) -> InstrumentPreset | None:
        return self.presets.get(name)

    def list_by_category(self, category: str) -> List[InstrumentPreset]:
        return [p for p in self.presets.values() if p.category == category]


# Global library instance
library = InstrumentLibrary()
