"""Plugin chain preset management system."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any
import uuid

from calliope.config import get_settings


class PresetCategory(str, Enum):
    VOCAL = "vocal"
    DRUMS = "drums"
    BASS = "bass"
    GUITAR = "guitar"
    SYNTH = "synth"
    MASTER = "master"
    FX = "fx"
    CUSTOM = "custom"


@dataclass
class PresetParameter:
    name: str
    value: float


@dataclass
class PresetPluginInstance:
    id: str
    plugin_name: str
    enabled: bool = True
    mix: float = 1.0
    parameters: list[PresetParameter] = field(default_factory=list)


@dataclass
class PluginPreset:
    id: str
    name: str
    description: str
    author: str = "Deepiri User"
    category: PresetCategory = PresetCategory.CUSTOM
    plugins: list[PresetPluginInstance] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""
    favorite: bool = False
    rating: int = 0

    def to_dict(self) -> dict:
        data = asdict(self)
        data["category"] = self.category.value if isinstance(self.category, PresetCategory) else self.category
        return data

    @classmethod
    def from_dict(cls, data: dict) -> PluginPreset:
        if isinstance(data.get("category"), str):
            data["category"] = PresetCategory(data["category"])
        return cls(**data)


class PresetManager:
    """Manages plugin chain presets with persistence."""

    def __init__(self):
        self._presets: dict[str, PluginPreset] = {}
        self._settings = get_settings()
        self._presets_file = self._settings.data_path / "plugin_presets.json"
        self._load_presets()
        self._init_factory_presets()

    def _load_presets(self) -> None:
        if self._presets_file.exists():
            try:
                with open(self._presets_file, "r") as f:
                    data = json.load(f)
                    for item in data.get("presets", []):
                        preset = PluginPreset.from_dict(item)
                        self._presets[preset.id] = preset
            except Exception:
                pass

    def _save_presets(self) -> None:
        self._presets_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "presets": [p.to_dict() for p in self._presets.values()],
            "version": "1.0",
        }
        with open(self._presets_file, "w") as f:
            json.dump(data, f, indent=2)

    def _init_factory_presets(self) -> None:
        if self._presets:
            return

        factory_presets = [
            self._create_vocal_chain_preset(),
            self._create_vocal_pop_preset(),
            self._create_vocal_rap_preset(),
            self._create_vocal_harmony_preset(),
            self._create_drums_buss_preset(),
            self._create_master_buss_preset(),
            self._create_radio_effect_preset(),
            self._create_robot_voice_preset(),
            self._create_space_reverb_preset(),
            self._create_warm_saturator_preset(),
        ]

        for preset in factory_presets:
            self._presets[preset.id] = preset

        self._save_presets()

    def _create_vocal_chain_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_vocal_chain",
            name="Vocal Chain",
            description="Classic vocal chain: HPF, de-ess, compress, EQ, de-ess, reverb",
            author="Team Deepiri",
            category=PresetCategory.VOCAL,
            tags=["vocal", "speech", "processing"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="HPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.15)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="De-Esser", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.5), PresetParameter(name="ratio", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.4), PresetParameter(name="ratio", value=0.6), PresetParameter(name="attack", value=0.3), PresetParameter(name="release", value=0.6)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Para EQ", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_gain", value=0.6), PresetParameter(name="mid_gain", value=0.4), PresetParameter(name="high_gain", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Plate Reverb", enabled=True, mix=0.25, parameters=[PresetParameter(name="size", value=0.6), PresetParameter(name="damping", value=0.5), PresetParameter(name="mix", value=0.25)]),
            ],
        )

    def _create_vocal_pop_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_vocal_pop",
            name="Pop Vocal",
            description="Bright, punchy pop vocal chain with subtle saturation",
            author="Team Deepiri",
            category=PresetCategory.VOCAL,
            tags=["vocal", "pop", "modern", "bright"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="HPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.1)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Saturation", enabled=True, mix=0.8, parameters=[PresetParameter(name="drive", value=0.25), PresetParameter(name="tone", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Vocal Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.35), PresetParameter(name="ratio", value=0.55), PresetParameter(name="attack", value=0.4), PresetParameter(name="release", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Para EQ", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_gain", value=0.45), PresetParameter(name="mid_gain", value=0.5), PresetParameter(name="high_gain", value=0.85)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Exciter", enabled=True, mix=0.3, parameters=[PresetParameter(name="amount", value=0.35), PresetParameter(name="blend", value=0.3)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Room Reverb", enabled=True, mix=0.15, parameters=[PresetParameter(name="size", value=0.4), PresetParameter(name="damping", value=0.6)]),
            ],
        )

    def _create_vocal_rap_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_vocal_rap",
            name="Rap Vocal",
            description="Aggressive rap vocal chain with punch and clarity",
            author="Team Deepiri",
            category=PresetCategory.VOCAL,
            tags=["vocal", "rap", "hip-hop", "punchy"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="HPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.2)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="De-Esser", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.6), PresetParameter(name="ratio", value=0.8)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Vocal Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.3), PresetParameter(name="ratio", value=0.7), PresetParameter(name="attack", value=0.2), PresetParameter(name="release", value=0.4)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Limiter", enabled=True, mix=1.0, parameters=[PresetParameter(name="ceiling", value=0.95), PresetParameter(name="release", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Para EQ", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_gain", value=0.5), PresetParameter(name="high_gain", value=0.9)]),
            ],
        )

    def _create_vocal_harmony_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_vocal_harmony",
            name="Vocal Harmony",
            description="Lush vocal with auto harmony and doubling",
            author="Team Deepiri",
            category=PresetCategory.VOCAL,
            tags=["vocal", "harmony", "chorus", "dreamy"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="HPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.1)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Chorus", enabled=True, mix=0.3, parameters=[PresetParameter(name="rate", value=0.25), PresetParameter(name="depth", value=0.4), PresetParameter(name="mix", value=0.3)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.45), PresetParameter(name="ratio", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Doubler", enabled=True, mix=0.5, parameters=[PresetParameter(name="detune", value=0.15), PresetParameter(name="spread", value=0.3)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Plate Reverb", enabled=True, mix=0.35, parameters=[PresetParameter(name="size", value=0.8), PresetParameter(name="damping", value=0.4), PresetParameter(name="mix", value=0.35)]),
            ],
        )

    def _create_drums_buss_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_drums_buss",
            name="Drum Buss",
            description="Full drums buss chain with compression and saturation",
            author="Team Deepiri",
            category=PresetCategory.DRUMS,
            tags=["drums", "buss", "glue", "punch"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Saturation", enabled=True, mix=0.7, parameters=[PresetParameter(name="drive", value=0.35), PresetParameter(name="tone", value=0.6)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Vocal Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.4), PresetParameter(name="ratio", value=0.6), PresetParameter(name="attack", value=0.25), PresetParameter(name="release", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Para EQ", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_gain", value=0.55), PresetParameter(name="high_gain", value=0.65)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Exciter", enabled=True, mix=0.25, parameters=[PresetParameter(name="amount", value=0.4), PresetParameter(name="blend", value=0.25)]),
            ],
        )

    def _create_master_buss_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_master_buss",
            name="Master Buss",
            description="Final master chain with stereo enhancement and limiting",
            author="Team Deepiri",
            category=PresetCategory.MASTER,
            tags=["master", "final", "stereo", "loudness"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Para EQ", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_gain", value=0.5), PresetParameter(name="mid_gain", value=0.5), PresetParameter(name="high_gain", value=0.55)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Stereo Enhancer", enabled=True, mix=0.8, parameters=[PresetParameter(name="width", value=0.6), PresetParameter(name="low_width", value=0.4), PresetParameter(name="high_width", value=0.8)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Multi-band Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="low_threshold", value=0.5), PresetParameter(name="mid_threshold", value=0.45), PresetParameter(name="high_threshold", value=0.4)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Limiter", enabled=True, mix=1.0, parameters=[PresetParameter(name="ceiling", value=0.98), PresetParameter(name="release", value=0.6)]),
            ],
        )

    def _create_radio_effect_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_radio_effect",
            name="Radio Effect",
            description="Vintage AM radio effect with filtering and compression",
            author="Team Deepiri",
            category=PresetCategory.FX,
            tags=["fx", "radio", "vintage", "lo-fi"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="HPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.25)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="LPF", enabled=True, mix=1.0, parameters=[PresetParameter(name="frequency", value=0.75)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Bitcrusher", enabled=True, mix=0.6, parameters=[PresetParameter(name="bits", value=0.4), PresetParameter(name="sample_rate", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.5), PresetParameter(name="ratio", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Chorus", enabled=True, mix=0.15, parameters=[PresetParameter(name="rate", value=0.1), PresetParameter(name="depth", value=0.2)]),
            ],
        )

    def _create_robot_voice_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_robot_voice",
            name="Robot Voice",
            description="Cybernetic robot voice effect",
            author="Team Deepiri",
            category=PresetCategory.FX,
            tags=["fx", "robot", "vocoder", "sci-fi"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Ring Modulator", enabled=True, mix=0.7, parameters=[PresetParameter(name="frequency", value=0.5), PresetParameter(name="mix", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Formant Shift", enabled=True, mix=1.0, parameters=[PresetParameter(name="shift", value=0.6), PresetParameter(name="formant_preserve", value=0.3)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Phaser", enabled=True, mix=0.4, parameters=[PresetParameter(name="rate", value=0.5), PresetParameter(name="depth", value=0.6), PresetParameter(name="stages", value=0.7)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Vocal Compressor", enabled=True, mix=1.0, parameters=[PresetParameter(name="threshold", value=0.4), PresetParameter(name="ratio", value=0.6)]),
            ],
        )

    def _create_space_reverb_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_space_reverb",
            name="Space Reverb",
            description="Massive deep space reverb with shimmer",
            author="Team Deepiri",
            category=PresetCategory.FX,
            tags=["fx", "reverb", "space", "ambient", "shimmer"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Shimmer Reverb", enabled=True, mix=0.5, parameters=[PresetParameter(name="size", value=0.9), PresetParameter(name="shimmer", value=0.7), PresetParameter(name="damping", value=0.3), PresetParameter(name="mix", value=0.5)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Hall Reverb", enabled=True, mix=0.3, parameters=[PresetParameter(name="size", value=0.85), PresetParameter(name="pre_delay", value=0.4), PresetParameter(name="mix", value=0.3)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Chorus", enabled=True, mix=0.2, parameters=[PresetParameter(name="rate", value=0.15), PresetParameter(name="depth", value=0.3)]),
            ],
        )

    def _create_warm_saturator_preset(self) -> PluginPreset:
        return PluginPreset(
            id="factory_warm_saturator",
            name="Warm Saturator",
            description="Warm analog-style saturator for any source",
            author="Team Deepiri",
            category=PresetCategory.FX,
            tags=["fx", "saturation", "warm", "analog", "color"],
            plugins=[
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Saturation", enabled=True, mix=0.8, parameters=[PresetParameter(name="drive", value=0.5), PresetParameter(name="tone", value=0.4)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Vintage", enabled=True, mix=0.6, parameters=[PresetParameter(name="warmth", value=0.7), PresetParameter(name="air", value=0.2)]),
                PresetPluginInstance(id=str(uuid.uuid4()), plugin_name="Chorus", enabled=True, mix=0.1, parameters=[PresetParameter(name="rate", value=0.08), PresetParameter(name="depth", value=0.15)]),
            ],
        )

    def create_preset(
        self,
        name: str,
        plugins: list[dict],
        description: str = "",
        category: PresetCategory = PresetCategory.CUSTOM,
        tags: list[str] | None = None,
        author: str = "Deepiri User",
    ) -> PluginPreset:
        preset = PluginPreset(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            author=author,
            category=category,
            tags=tags or [],
            plugins=[
                PresetPluginInstance(
                    id=p.get("id", str(uuid.uuid4())),
                    plugin_name=p["plugin_name"],
                    enabled=p.get("enabled", True),
                    mix=p.get("mix", 1.0),
                    parameters=[
                        PresetParameter(name=pp["name"], value=pp["value"])
                        for pp in p.get("parameters", [])
                    ],
                )
                for p in plugins
            ],
        )
        self._presets[preset.id] = preset
        self._save_presets()
        return preset

    def get_preset(self, preset_id: str) -> PluginPreset | None:
        return self._presets.get(preset_id)

    def list_presets(
        self,
        category: PresetCategory | None = None,
        tag: str | None = None,
        search: str | None = None,
        favorites_only: bool = False,
    ) -> list[PluginPreset]:
        results = list(self._presets.values())
        
        if category:
            results = [p for p in results if p.category == category]
        
        if tag:
            results = [p for p in results if tag in p.tags]
        
        if search:
            search_lower = search.lower()
            results = [
                p for p in results
                if search_lower in p.name.lower() or search_lower in p.description.lower()
            ]
        
        if favorites_only:
            results = [p for p in results if p.favorite]
        
        return sorted(results, key=lambda p: p.name)

    def update_preset(self, preset_id: str, updates: dict) -> PluginPreset | None:
        preset = self._presets.get(preset_id)
        if not preset:
            return None
        
        for key, value in updates.items():
            if hasattr(preset, key) and key != "id":
                setattr(preset, key, value)
        
        self._save_presets()
        return preset

    def delete_preset(self, preset_id: str) -> bool:
        if preset_id in self._presets:
            del self._presets[preset_id]
            self._save_presets()
            return True
        return False

    def toggle_favorite(self, preset_id: str) -> bool:
        preset = self._presets.get(preset_id)
        if preset:
            preset.favorite = not preset.favorite
            self._save_presets()
            return preset.favorite
        return False

    def set_rating(self, preset_id: str, rating: int) -> bool:
        preset = self._presets.get(preset_id)
        if preset:
            preset.rating = max(0, min(5, rating))
            self._save_presets()
            return True
        return False

    def duplicate_preset(self, preset_id: str, new_name: str) -> PluginPreset | None:
        original = self._presets.get(preset_id)
        if not original:
            return None
        
        duplicate = PluginPreset(
            id=str(uuid.uuid4()),
            name=new_name,
            description=original.description,
            author=original.author,
            category=original.category,
            tags=original.tags.copy(),
            plugins=[
                PresetPluginInstance(
                    id=str(uuid.uuid4()),
                    plugin_name=p.plugin_name,
                    enabled=p.enabled,
                    mix=p.mix,
                    parameters=p.parameters.copy(),
                )
                for p in original.plugins
            ],
        )
        self._presets[duplicate.id] = duplicate
        self._save_presets()
        return duplicate

    def export_preset(self, preset_id: str) -> dict | None:
        preset = self._presets.get(preset_id)
        if preset:
            return preset.to_dict()
        return None

    def import_preset(self, data: dict) -> PluginPreset:
        if "id" in data:
            data["id"] = str(uuid.uuid4())
        preset = PluginPreset.from_dict(data)
        self._presets[preset.id] = preset
        self._save_presets()
        return preset


_preset_manager: PresetManager | None = None


def get_preset_manager() -> PresetManager:
    global _preset_manager
    if _preset_manager is None:
        _preset_manager = PresetManager()
    return _preset_manager