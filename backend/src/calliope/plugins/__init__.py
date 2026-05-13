"""Calliope DSP plugin system."""

from __future__ import annotations

from calliope.plugins.base import (
    AudioPlugin,
    PluginCategory,
    PluginInfo,
    PluginParameter,
    PluginRegistry,
    PluginState,
    get_plugin_registry,
    register_plugin,
)

__all__ = [
    "AudioPlugin",
    "PluginCategory",
    "PluginInfo",
    "PluginParameter",
    "PluginRegistry",
    "PluginState",
    "get_plugin_registry",
    "register_plugin",
]

from calliope.plugins import filters, dynamics, effects, modulation, distortion, eq, mastering, pitch

__all__ += [
    "filters",
    "dynamics",
    "effects",
    "modulation",
    "distortion",
    "eq",
    "mastering",
    "pitch",
]