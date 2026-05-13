"""Advanced audio routing matrix for complex signal chains."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class BusConfig:
    name: str
    channels: int = 2
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    soloed: bool = False


@dataclass
class SendConfig:
    source: str
    destination: str
    amount: float = 1.0
    pre_fader: bool = False


@dataclass
class RouterConfig:
    inputs: list[str] = field(default_factory=list)
    buses: list[BusConfig] = field(default_factory=list)
    sends: list[SendConfig] = field(default_factory=list)
    master_bus: str = "master"


class AudioRouter:
    """Flexible audio routing matrix."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = RouterConfig()
        self.mixer_state = {}
        self.meters = {}

    def add_input(self, name: str, channels: int = 2) -> None:
        if name not in self.config.inputs:
            self.config.inputs.append(name)
            self.mixer_state[name] = {
                "channels": channels,
                "volume": 1.0,
                "pan": 0.0,
                "muted": False,
                "soloed": False,
                "sends": {},
            }

    def add_bus(self, name: str, channels: int = 2) -> None:
        bus = BusConfig(name=name, channels=channels)
        self.config.buses.append(bus)
        self.mixer_state[name] = {
            "channels": channels,
            "volume": 1.0,
            "pan": 0.0,
            "muted": False,
            "soloed": False,
            "sends": {},
            "input_sources": [],
        }

    def add_send(self, source: str, destination: str, amount: float = 1.0, pre_fader: bool = False) -> None:
        send = SendConfig(source, destination, amount, pre_fader)
        self.config.sends.append(send)

        if source in self.mixer_state:
            if destination not in self.mixer_state[source]["sends"]:
                self.mixer_state[source]["sends"][destination] = {"amount": amount, "pre_fader": pre_fader}

    def set_volume(self, channel: str, volume: float) -> None:
        if channel in self.mixer_state:
            self.mixer_state[channel]["volume"] = np.clip(volume, 0, 2)

    def set_pan(self, channel: str, pan: float) -> None:
        if channel in self.mixer_state:
            self.mixer_state[channel]["pan"] = np.clip(pan, -1, 1)

    def set_mute(self, channel: str, muted: bool) -> None:
        if channel in self.mixer_state:
            self.mixer_state[channel]["muted"] = muted

    def set_solo(self, channel: str, soloed: bool) -> None:
        if channel in self.mixer_state:
            self.mixer_state[channel]["soloed"] = soloed

    def process_mix(self, inputs: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
        outputs = {}
        soloed_channels = [ch for ch, state in self.mixer_state.items() if state.get("soloed", False)]

        for channel_name, channel_data in self.mixer_state.items():
            if channel_name not in inputs:
                continue

            samples = inputs[channel_name]

            if channel_data.get("muted", False):
                outputs[channel_name] = np.zeros_like(samples)
                continue

            if soloed_channels and not channel_data.get("soloed", False):
                outputs[channel_name] = np.zeros_like(samples)
                continue

            volume = channel_data.get("volume", 1.0)
            pan = channel_data.get("pan", 0.0)

            processed = samples * volume

            if processed.ndim == 1 and len(self.config.buses) > 0:
                processed = np.stack([processed, processed], axis=1)

            if processed.ndim == 2 and len(pan) > 0:
                left_gain = np.sqrt(2) * np.cos((pan + 1) * np.pi / 4)
                right_gain = np.sqrt(2) * np.sin((pan + 1) * np.pi / 4)
                processed[:, 0] *= left_gain
                processed[:, 1] *= right_gain

            outputs[channel_name] = processed

        for send in self.config.sends:
            if send.source not in outputs or send.destination not in self.mixer_state:
                continue

            if send.source not in self.mixer_state[send.destination].get("input_sources", []):
                self.mixer_state[send.destination].setdefault("input_sources", []).append(send.source)

            if send.destination not in outputs:
                outputs[send.destination] = np.zeros((len(next(iter(outputs.values()))), 2))

            amount = send.amount
            send_signal = outputs[send.source] * amount

            if outputs[send.destination].shape == send_signal.shape:
                outputs[send.destination] = outputs[send.destination] + send_signal

        if self.config.master_bus in outputs:
            master_output = outputs[self.config.master_bus]
            if master_output.ndim == 2:
                peak_l = np.max(np.abs(master_output[:, 0]))
                peak_r = np.max(np.abs(master_output[:, 1]))
                self.meters["master"] = {"left": peak_l, "right": peak_r}
            else:
                peak = np.max(np.abs(master_output))
                self.meters["master"] = {"left": peak, "right": peak}

        return outputs

    def get_meters(self) -> dict:
        return self.meters

    def get_bus_mix(self) -> dict:
        mix = {}
        for bus in self.config.buses:
            if bus.name in self.mixer_state:
                state = self.mixer_state[bus.name]
                input_sources = state.get("input_sources", [])
                mix[bus.name] = {
                    "name": bus.name,
                    "volume": state.get("volume", 1.0),
                    "pan": state.get("pan", 0.0),
                    "muted": state.get("muted", False),
                    "soloed": state.get("soloed", False),
                    "inputs": input_sources,
                }
        return mix

    def reset(self) -> None:
        for channel in self.mixer_state:
            self.mixer_state[channel]["volume"] = 1.0
            self.mixer_state[channel]["pan"] = 0.0
            self.mixer_state[channel]["muted"] = False
            self.mixer_state[channel]["soloed"] = False

        self.meters.clear()


class EffectChainRouter:
    """Route audio through multiple effects chains."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.chains = {}
        self.order = []

    def add_chain(self, name: str) -> None:
        self.chains[name] = {"effects": [], "bypass": False}
        if name not in self.order:
            self.order.append(name)

    def add_effect_to_chain(self, chain_name: str, effect_name: str, parameters: dict) -> None:
        if chain_name in self.chains:
            self.chains[chain_name]["effects"].append({
                "name": effect_name,
                "parameters": parameters,
            })

    def remove_effect_from_chain(self, chain_name: str, index: int) -> None:
        if chain_name in self.chains and 0 <= index < len(self.chains[chain_name]["effects"]):
            self.chains[chain_name]["effects"].pop(index)

    def bypass_chain(self, chain_name: str, bypass: bool = True) -> None:
        if chain_name in self.chains:
            self.chains[chain_name]["bypass"] = bypass

    def process_through_chains(self, samples: np.ndarray) -> np.ndarray:
        processed = samples.copy()

        for chain_name in self.order:
            chain = self.chains[chain_name]

            if chain["bypass"]:
                continue

            for effect in chain["effects"]:
                try:
                    from calliope.plugins.base import get_plugin_registry
                    registry = get_plugin_registry()
                    plugin = registry.create(effect["name"], self.sr)

                    for param_name, param_value in effect["parameters"].items():
                        plugin.set_parameter(param_name, param_value)

                    processed = plugin.process(processed)
                except Exception:
                    pass

        return processed


class ParallelPath:
    """Create parallel effect processing paths."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.paths = {}

    def add_path(self, name: str, effects: list[dict] | None = None) -> None:
        self.paths[name] = {
            "effects": effects or [],
            "gain": 1.0,
            "pan": 0.0,
        }

    def process_parallel(
        self,
        samples: np.ndarray,
        mix: float = 1.0,
    ) -> np.ndarray:
        results = []

        for path_name, path in self.paths.items():
            processed = samples.copy()

            for effect in path["effects"]:
                try:
                    from calliope.plugins.base import get_plugin_registry
                    registry = get_plugin_registry()
                    plugin = registry.create(effect["name"], self.sr)

                    for param_name, param_value in effect["parameters"].items():
                        plugin.set_parameter(param_name, param_value)

                    processed = plugin.process(processed)
                except Exception:
                    pass

            processed = processed * path["gain"]

            if processed.ndim == 1:
                processed = np.stack([processed, processed], axis=1)

            pan = path["pan"]
            left_gain = np.sqrt(2) * np.cos((pan + 1) * np.pi / 4)
            right_gain = np.sqrt(2) * np.sin((pan + 1) * np.pi / 4)
            processed[:, 0] *= left_gain
            processed[:, 1] *= right_gain

            results.append(processed)

        if not results:
            return samples

        mixed = np.sum(results, axis=0)

        if mix < 1.0:
            return (1 - mix) * samples + mix * mixed / len(results)
        return mixed / len(results)


def create_mixer_routing(
    tracks: list[str],
    buses: list[str],
    sends: list[tuple[str, str, float]] | None = None,
) -> AudioRouter:
    """Create a mixer routing matrix."""
    router = AudioRouter()

    for track in tracks:
        router.add_input(track)

    for bus in buses:
        router.add_bus(bus)

    if sends:
        for source, dest, amount in sends:
            router.add_send(source, dest, amount)

    return router


def apply_send_levels(
    samples: np.ndarray,
    send_amounts: dict[str, float],
    master_volume: float = 1.0,
) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """Apply send levels to create multiple outputs."""
    outputs = {}
    sum_output = np.zeros_like(samples)

    for dest_name, amount in send_amounts.items():
        send_signal = samples * amount * master_volume

        if send_signal.ndim == 1:
            send_signal = np.stack([send_signal, send_signal], axis=1)

        outputs[dest_name] = send_signal
        sum_output = sum_output + send_signal if sum_output.ndim == 2 else sum_output + send_signal[:, 0]

    return outputs, sum_output