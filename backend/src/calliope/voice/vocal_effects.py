"""Vocal effect preset chains with professional sound design."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Callable
import numpy as np


class VocalEffectType(str, Enum):
    TELEPHONE = "telephone"
    RADIO = "radio"
    ROBOT = "robot"
    SPACE = "space"
    DREAM = "dream"
    CHIPMUNK = "chipmunk"
    DEEP = "deep"
    ECHO = "echo"
    HARMONY = "harmony"
    CHORUS = "chorus"
    VAPORWAVE = "vaporwave"
    LOFI = "lofi"
    MEGAPHONE = "megaphone"
    DISTANT = "distant"
    UNDERWATER = "underwater"


@dataclass
class EffectParameter:
    name: str
    value: float
    range_min: float = 0.0
    range_max: float = 1.0


@dataclass
class VocalEffectPreset:
    name: str
    effect_type: VocalEffectType
    description: str
    tags: list[str]
    plugins: list[tuple[str, list[EffectParameter]]]
    processing_order: list[str]


class VocalEffectsChain:
    """Apply complex vocal effect chains to audio."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.presets = self._build_presets()

    def _build_presets(self) -> dict[VocalEffectType, VocalEffectPreset]:
        return {
            VocalEffectType.TELEPHONE: VocalEffectPreset(
                name="Telephone",
                effect_type=VocalEffectType.TELEPHONE,
                description="Classic telephone bandpass effect",
                tags=["vintage", "phone", "retro", "lo-fi"],
                plugins=[
                    ("BPF", [EffectParameter("frequency", 0.25), EffectParameter("q", 0.8)]),
                    ("HPF", [EffectParameter("frequency", 0.15)]),
                    ("LPF", [EffectParameter("frequency", 0.65)]),
                    ("Saturation", [EffectParameter("drive", 0.3), EffectParameter("tone", 0.5)]),
                    ("Compressor", [EffectParameter("threshold", 0.5), EffectParameter("ratio", 0.7)]),
                ],
                processing_order=["HPF", "LPF", "BPF", "Saturation", "Compressor"],
            ),
            VocalEffectType.RADIO: VocalEffectPreset(
                name="Radio",
                effect_type=VocalEffectType.RADIO,
                description="AM/FM radio broadcast effect",
                tags=["vintage", "radio", "broadcast", "nostalgic"],
                plugins=[
                    ("BPF", [EffectParameter("frequency", 0.2), EffectParameter("q", 0.6)]),
                    ("LPF", [EffectParameter("frequency", 0.7)]),
                    ("Chorus", [EffectParameter("rate", 0.15), EffectParameter("depth", 0.3), EffectParameter("mix", 0.2)]),
                    ("Compressor", [EffectParameter("threshold", 0.4), EffectParameter("ratio", 0.6)]),
                    ("Limiter", [EffectParameter("ceiling", 0.95)]),
                ],
                processing_order=["BPF", "LPF", "Chorus", "Compressor", "Limiter"],
            ),
            VocalEffectType.ROBOT: VocalEffectPreset(
                name="Robot",
                effect_type=VocalEffectType.ROBOT,
                description="Cybernetic robot voice transformation",
                tags=["sci-fi", "robot", "futuristic", "transform"],
                plugins=[
                    ("Ring Modulator", [EffectParameter("frequency", 0.5), EffectParameter("mix", 0.7)]),
                    ("Formant Shift", [EffectParameter("shift", 0.6), EffectParameter("formant_preserve", 0.3)]),
                    ("Phaser", [EffectParameter("rate", 0.5), EffectParameter("depth", 0.6), EffectParameter("stages", 0.7)]),
                    ("Vocal Compressor", [EffectParameter("threshold", 0.4), EffectParameter("ratio", 0.6)]),
                ],
                processing_order=["Ring Modulator", "Formant Shift", "Phaser", "Vocal Compressor"],
            ),
            VocalEffectType.SPACE: VocalEffectPreset(
                name="Space",
                effect_type=VocalEffectType.SPACE,
                description="Deep space reverb with shimmer",
                tags=["ambient", "space", "reverb", "ethereal"],
                plugins=[
                    ("Shimmer Reverb", [EffectParameter("size", 0.9), EffectParameter("shimmer", 0.7), EffectParameter("damping", 0.3), EffectParameter("mix", 0.5)]),
                    ("Hall Reverb", [EffectParameter("size", 0.85), EffectParameter("pre_delay", 0.4), EffectParameter("mix", 0.3)]),
                    ("Chorus", [EffectParameter("rate", 0.15), EffectParameter("depth", 0.3)]),
                ],
                processing_order=["Shimmer Reverb", "Hall Reverb", "Chorus"],
            ),
            VocalEffectType.DREAM: VocalEffectPreset(
                name="Dream",
                effect_type=VocalEffectType.DREAM,
                description="Soft, dreamy vocal effect",
                tags=["soft", "dream", "ethereal", "ambient"],
                plugins=[
                    ("HPF", [EffectParameter("frequency", 0.08)]),
                    ("Chorus", [EffectParameter("rate", 0.1), EffectParameter("depth", 0.5), EffectParameter("mix", 0.4)]),
                    ("Plate Reverb", [EffectParameter("size", 0.7), EffectParameter("damping", 0.6), EffectParameter("mix", 0.4)]),
                    ("Para EQ", [EffectParameter("low_gain", 0.6), EffectParameter("high_gain", 0.8)]),
                ],
                processing_order=["HPF", "Chorus", "Plate Reverb", "Para EQ"],
            ),
            VocalEffectType.CHIPMUNK: VocalEffectPreset(
                name="Chipmunk",
                effect_type=VocalEffectType.CHIPMUNK,
                description="Pitch up effect for fun voice change",
                tags=["fun", "pitch", "cartoon", "comedy"],
                plugins=[
                    ("Pitch Shifter", [EffectParameter("semitones", 0.7), EffectParameter("formant_preserve", 0.8)]),
                    ("Compressor", [EffectParameter("threshold", 0.4), EffectParameter("ratio", 0.5)]),
                ],
                processing_order=["Pitch Shifter", "Compressor"],
            ),
            VocalEffectType.DEEP: VocalEffectPreset(
                name="Deep Voice",
                effect_type=VocalEffectType.DEEP,
                description="Deep, bassy voice transformation",
                tags=["deep", "bass", "dramatic", "low"],
                plugins=[
                    ("LPF", [EffectParameter("frequency", 0.4)]),
                    ("Saturation", [EffectParameter("drive", 0.4), EffectParameter("tone", 0.3)]),
                    ("Compressor", [EffectParameter("threshold", 0.35), EffectParameter("ratio", 0.7)]),
                ],
                processing_order=["LPF", "Saturation", "Compressor"],
            ),
            VocalEffectType.ECHO: VocalEffectPreset(
                name="Echo Chamber",
                effect_type=VocalEffectType.ECHO,
                description="Classic slap-back echo",
                tags=["echo", "retro", "rockabilly", "slap"],
                plugins=[
                    ("Delay", [EffectParameter("time", 0.25), EffectParameter("feedback", 0.4), EffectParameter("mix", 0.35)]),
                    ("Compressor", [EffectParameter("threshold", 0.45), EffectParameter("ratio", 0.5)]),
                ],
                processing_order=["Delay", "Compressor"],
            ),
            VocalEffectType.HARMONY: VocalEffectPreset(
                name="Auto Harmony",
                effect_type=VocalEffectType.HARMONY,
                description="Automatic harmony generation",
                tags=["harmony", "chorus", "rich", "vocal"],
                plugins=[
                    ("Doubler", [EffectParameter("detune", 0.15), EffectParameter("spread", 0.3)]),
                    ("Chorus", [EffectParameter("rate", 0.2), EffectParameter("depth", 0.4), EffectParameter("mix", 0.3)]),
                    ("Plate Reverb", [EffectParameter("size", 0.6), EffectParameter("damping", 0.5), EffectParameter("mix", 0.25)]),
                ],
                processing_order=["Doubler", "Chorus", "Plate Reverb"],
            ),
            VocalEffectType.CHORUS: VocalEffectPreset(
                name="Vocal Chorus",
                effect_type=VocalEffectType.CHORUS,
                description="Lush chorus effect for doubling",
                tags=["chorus", "thick", "full", "vocal"],
                plugins=[
                    ("Chorus", [EffectParameter("rate", 0.12), EffectParameter("depth", 0.6), EffectParameter("mix", 0.5)]),
                    ("Para EQ", [EffectParameter("low_gain", 0.55), EffectParameter("high_gain", 0.7)]),
                ],
                processing_order=["Chorus", "Para EQ"],
            ),
            VocalEffectType.VAPORWAVE: VocalEffectPreset(
                name="Vaporwave",
                effect_type=VocalEffectType.VAPORWAVE,
                description="Retro 80s synth wave effect",
                tags=["retro", "synth", "80s", "vaporwave", "lo-fi"],
                plugins=[
                    ("LPF", [EffectParameter("frequency", 0.5)]),
                    ("Bitcrusher", [EffectParameter("bits", 0.6), EffectParameter("sample_rate", 0.5)]),
                    ("Shimmer Reverb", [EffectParameter("size", 0.7), EffectParameter("shimmer", 0.4), EffectParameter("mix", 0.3)]),
                    ("Compressor", [EffectParameter("threshold", 0.45), EffectParameter("ratio", 0.6)]),
                ],
                processing_order=["LPF", "Bitcrusher", "Shimmer Reverb", "Compressor"],
            ),
            VocalEffectType.LOFI: VocalEffectPreset(
                name="Lo-Fi",
                effect_type=VocalEffectType.LOFI,
                description="Warm, nostalgic lo-fi effect",
                tags=["lo-fi", "warm", "vintage", "nostalgic"],
                plugins=[
                    ("HPF", [EffectParameter("frequency", 0.12)]),
                    ("LPF", [EffectParameter("frequency", 0.6)]),
                    ("Vintage", [EffectParameter("warmth", 0.7), EffectParameter("air", 0.2)]),
                    ("Bitcrusher", [EffectParameter("bits", 0.7), EffectParameter("sample_rate", 0.4)]),
                    ("Chorus", [EffectParameter("rate", 0.08), EffectParameter("depth", 0.2)]),
                ],
                processing_order=["HPF", "LPF", "Bitcrusher", "Vintage", "Chorus"],
            ),
            VocalEffectType.MEGAPHONE: VocalEffectPreset(
                name="Megaphone",
                effect_type=VocalEffectType.MEGAPHONE,
                description="Loud, aggressive megaphone effect",
                tags=["aggressive", "loud", "megaphone", "distort"],
                plugins=[
                    ("BPF", [EffectParameter("frequency", 0.3), EffectParameter("q", 0.5)]),
                    ("Distortion", [EffectParameter("drive", 0.6), EffectParameter("tone", 0.7)]),
                    ("Limiter", [EffectParameter("ceiling", 0.98), EffectParameter("release", 0.4)]),
                    ("Compressor", [EffectParameter("threshold", 0.3), EffectParameter("ratio", 0.8)]),
                ],
                processing_order=["BPF", "Distortion", "Compressor", "Limiter"],
            ),
            VocalEffectType.DISTANT: VocalEffectPreset(
                name="Distant",
                effect_type=VocalEffectType.DISTANT,
                description="Distant, room-like effect",
                tags=["distant", "room", "ambient", "mysterious"],
                plugins=[
                    ("HPF", [EffectParameter("frequency", 0.08)]),
                    ("Room Reverb", [EffectParameter("size", 0.8), EffectParameter("damping", 0.7), EffectParameter("mix", 0.5)]),
                    ("Saturation", [EffectParameter("drive", 0.2), EffectParameter("tone", 0.4)]),
                ],
                processing_order=["HPF", "Room Reverb", "Saturation"],
            ),
            VocalEffectType.UNDERWATER: VocalEffectPreset(
                name="Underwater",
                effect_type=VocalEffectType.UNDERWATER,
                description="Muffled, underwater effect",
                tags=["underwater", "muffled", "bubbly", "fun"],
                plugins=[
                    ("LPF", [EffectParameter("frequency", 0.4)]),
                    ("Phaser", [EffectParameter("rate", 0.2), EffectParameter("depth", 0.7), EffectParameter("stages", 0.5)]),
                    ("Room Reverb", [EffectParameter("size", 0.9), EffectParameter("damping", 0.8), EffectParameter("mix", 0.4)]),
                ],
                processing_order=["LPF", "Phaser", "Room Reverb"],
            ),
        }

    def get_preset(self, effect_type: VocalEffectType) -> VocalEffectPreset | None:
        return self.presets.get(effect_type)

    def list_presets(self) -> list[dict]:
        return [
            {
                "type": p.effect_type.value,
                "name": p.name,
                "description": p.description,
                "tags": p.tags,
                "plugin_count": len(p.plugins),
            }
            for p in self.presets.values()
        ]

    def apply_effect(
        self,
        samples: np.ndarray,
        effect_type: VocalEffectType,
        dry_wet: float = 1.0,
    ) -> np.ndarray:
        """Apply a vocal effect preset to audio samples."""
        preset = self.presets.get(effect_type)
        if preset is None:
            return samples

        from calliope.plugins.base import get_plugin_registry
        registry = get_plugin_registry()

        if dry_wet < 1.0:
            dry = samples.copy()

        processed = samples.copy()
        
        for plugin_name, params in preset.plugins:
            try:
                plugin = registry.create(plugin_name, self.sr)
                
                for param in params:
                    plugin.set_parameter(param.name, param.value)
                
                processed = plugin.process(processed)
            except Exception:
                pass

        if dry_wet < 1.0:
            processed = (1 - dry_wet) * dry + dry_wet * processed

        return processed


def apply_vocal_effect(
    samples: np.ndarray,
    effect_type: str,
    sr: int = 48000,
    dry_wet: float = 1.0,
) -> np.ndarray:
    """Convenience function to apply a vocal effect."""
    chain = VocalEffectsChain(sr)
    try:
        effect = VocalEffectType(effect_type)
        return chain.apply_effect(samples, effect, dry_wet)
    except ValueError:
        return samples