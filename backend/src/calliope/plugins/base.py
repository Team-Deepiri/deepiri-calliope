"""DSP plugin system for Calliope audio processing."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, TypeVar

import numpy as np


TPlugin = TypeVar("TPlugin", bound="AudioPlugin")


class PluginCategory(str, Enum):
    FILTER = "filter"
    DYNAMICS = "dynamics"
    EQ = "eq"
    REVERB = "reverb"
    DELAY = "delay"
    DISTORTION = "distortion"
    MODULATION = "modulation"
    PITCH = "pitch"
    UTILITY = "utility"


@dataclass
class PluginParameter:
    name: str
    value: float
    min_value: float = 0.0
    max_value: float = 1.0
    default_value: float = 0.5
    step: float = 0.01
    unit: str = ""
    description: str = ""
    automate: bool = True


@dataclass
class PluginState:
    enabled: bool = True
    bypassed: bool = False
    mix: float = 1.0
    parameters: dict[str, float] = field(default_factory=dict)


@dataclass
class PluginInfo:
    name: str
    version: str
    category: PluginCategory
    description: str
    author: str = "Team Deepiri"
    parameters: list[PluginParameter] = field(default_factory=list)
    sidechain_enabled: bool = False
    realtime_safe: bool = True


class AudioPlugin(ABC):
    """Base class for all DSP plugins."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._state = PluginState()
        self._info = self._create_info()
        self._initialize_parameters()

    @abstractmethod
    def _create_info(self) -> PluginInfo:
        """Return plugin metadata."""
        pass

    @abstractmethod
    def process(self, samples: np.ndarray) -> np.ndarray:
        """Process audio samples. Override in subclass."""
        pass

    def process_stereo(
        self, left: np.ndarray, right: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """Process stereo pair. Default implementation splits to mono, processes, splits back."""
        mono = (left + right) / 2.0
        processed = self.process(mono)
        return processed, processed

    def reset(self) -> None:
        """Reset internal state. Called when processing restarts."""
        pass

    def set_parameter(self, name: str, value: float) -> None:
        self._state.parameters[name] = float(np.clip(value, 0.0, 1.0))

    def get_parameter(self, name: str) -> float:
        return self._state.parameters.get(name, 0.5)

    def set_enabled(self, enabled: bool) -> None:
        self._state.enabled = enabled

    def set_bypassed(self, bypassed: bool) -> None:
        self._state.bypassed = bypassed

    def set_mix(self, mix: float) -> None:
        self._state.mix = float(np.clip(mix, 0.0, 1.0))

    @property
    def info(self) -> PluginInfo:
        return self._info

    @property
    def state(self) -> PluginState:
        return self._state

    def _initialize_parameters(self) -> None:
        for param in self._info.parameters:
            self._state.parameters[param.name] = param.default_value

    def _map_param(self, name: str, value: float, center: float = 0.5) -> float:
        """Map normalized parameter to actual value range."""
        param = next((p for p in self._info.parameters if p.name == name), None)
        if param is None:
            return value
        
        normalized = (value - center) * 2.0
        return param.min_value + (normalized + 1.0) * 0.5 * (param.max_value - param.min_value)

    def _apply_mix(self, dry: np.ndarray, wet: np.ndarray) -> np.ndarray:
        mix = self._state.mix
        return ((1.0 - mix) * dry + mix * wet).astype(np.float64)


class PluginRegistry:
    """Registry for all available plugins."""

    def __init__(self):
        self._plugins: dict[str, type[AudioPlugin]] = {}
        self._instances: dict[str, AudioPlugin] = {}

    def register(self, plugin_class: type[TPlugin]) -> type[TPlugin]:
        """Register a plugin class."""
        instance = plugin_class()
        self._plugins[instance.info.name] = plugin_class
        return plugin_class

    def create(self, name: str, sr: int = 48000) -> AudioPlugin:
        """Create a plugin instance by name."""
        if name not in self._plugins:
            raise ValueError(f"Unknown plugin: {name}")
        instance = self._plugins[name](sr)
        self._instances[name] = instance
        return instance

    def list_plugins(self, category: PluginCategory | None = None) -> list[str]:
        """List all registered plugin names."""
        if category is None:
            return list(self._plugins.keys())
        return [
            name for name, cls in self._plugins.items()
            if cls().info.category == category
        ]

    def get_instance(self, name: str) -> AudioPlugin | None:
        return self._instances.get(name)


_default_registry: PluginRegistry | None = None


def get_plugin_registry() -> PluginRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = PluginRegistry()
    return _default_registry


def register_plugin(plugin_class: type[TPlugin]) -> type[TPlugin]:
    """Convenience decorator to register a plugin."""
    return get_plugin_registry().register(plugin_class)