"""Dynamics plugins - compressor, limiter, gate, de-esser, expander."""

from __future__ import annotations

import numpy as np
from scipy import signal

from calliope.plugins.base import (
    AudioPlugin,
    PluginCategory,
    PluginInfo,
    PluginParameter,
    register_plugin,
)


@register_plugin
class Compressor(AudioPlugin):
    """Full-featured dynamics compressor."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Compressor",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Dynamics compressor with attack/release",
            parameters=[
                PluginParameter("threshold", 0.7, -60.0, 0.0, -18.0, "dB", "Compressor threshold"),
                PluginParameter("ratio", 0.4, 1.0, 20.0, 4.0, ":1", "Compression ratio"),
                PluginParameter("attack", 0.01, 0.1, 100.0, 10.0, "ms", "Attack time"),
                PluginParameter("release", 0.05, 1.0, 1000.0, 100.0, "ms", "Release time"),
                PluginParameter("knee", 0.1, 0.0, 20.0, 6.0, "dB", "Soft knee width"),
                PluginParameter("makeup", 0.0, 0.0, 30.0, 0.0, "dB", "Makeup gain"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
            sidechain_enabled=True,
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._envelope = 0.0

    def _envelope_follower(self, samples: np.ndarray, attack_ms: float, release_ms: float) -> np.ndarray:
        attack_coef = np.exp(-1.0 / (attack_ms * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000.0))
        
        envelope = np.zeros_like(samples)
        env = self._envelope
        
        for i, sample in enumerate(samples):
            abs_sample = abs(sample)
            if abs_sample > env:
                env = attack_coef * env + (1.0 - attack_coef) * abs_sample
            else:
                env = release_coef * env + (1.0 - release_coef) * abs_sample
            envelope[i] = env
        
        self._envelope = env
        return envelope

    def process(self, samples: np.ndarray) -> np.ndarray:
        threshold = float(self.get_parameter("threshold"))
        ratio = float(self.get_parameter("ratio"))
        attack = float(self.get_parameter("attack"))
        release = float(self.get_parameter("release"))
        knee = float(self.get_parameter("knee"))
        makeup = float(self.get_parameter("makeup"))
        mix = float(self.get_parameter("mix"))

        threshold_lin = 10 ** (threshold / 20.0)
        knee_lin = 10 ** (knee / 20.0)

        envelope = self._envelope_follower(samples, attack, release)

        gain = np.ones_like(envelope)
        above_threshold = envelope > threshold_lin / knee_lin
        
        if knee > 0:
            knee_start = threshold_lin / knee_lin
            in_knee = (envelope >= knee_start) & (envelope <= threshold_lin * knee_lin)
            gain[in_knee] = 1.0 + ((envelope[in_knee] - knee_start) / (threshold_lin * knee_lin - knee_start)) * (1.0 / ratio - 1.0) * 0.5
            
            above = envelope > threshold_lin * knee_lin
            gain[above] = 1.0 + (envelope[above] / threshold_lin) * (1.0 / ratio - 1.0)
        else:
            above = envelope > threshold_lin
            gain[above] = 1.0 + (envelope[above] / threshold_lin) * (1.0 / ratio - 1.0)

        gain = np.clip(gain, 1.0 / ratio, 100.0)
        
        compressed = samples * gain

        if makeup > 0:
            compressed *= 10 ** (makeup / 20.0)

        return self._apply_mix(samples, np.clip(compressed, -1.0, 1.0))


@register_plugin
class Limiter(AudioPlugin):
    """Look-ahead limiter for transparent limiting."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Limiter",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Look-ahead brickwall limiter",
            parameters=[
                PluginParameter("ceiling", 0.95, -12.0, 0.0, -0.3, "dB", "Output ceiling"),
                PluginParameter("release", 0.05, 0.1, 500.0, 50.0, "ms", "Release time"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._gain = 1.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        ceiling = float(self.get_parameter("ceiling"))
        release = float(self.get_parameter("release"))
        mix = float(self.get_parameter("mix"))

        ceiling_lin = 10 ** (ceiling / 20.0)
        release_coef = np.exp(-1.0 / (release * self.sr / 1000.0))

        output = np.zeros_like(samples)
        gain = self._gain

        for i in range(len(samples)):
            abs_sample = abs(samples[i])
            
            target_gain = 1.0
            if abs_sample * gain > ceiling_lin:
                target_gain = ceiling_lin / abs_sample

            if target_gain < gain:
                gain = target_gain
            else:
                gain = release_coef * gain + (1.0 - release_coef) * target_gain

            output[i] = samples[i] * gain

        self._gain = gain
        return self._apply_mix(samples, np.clip(output, -1.0, 1.0))


@register_plugin
class NoiseGate(AudioPlugin):
    """Expander/gate for noise reduction."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Noise Gate",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Expander gate for noise reduction",
            parameters=[
                PluginParameter("threshold", 0.3, -80.0, 0.0, -40.0, "dB", "Gate threshold"),
                PluginParameter("ratio", 0.1, 1.0, 10.0, 3.0, ":1", "Expansion ratio"),
                PluginParameter("attack", 0.0, 0.1, 50.0, 1.0, "ms", "Gate attack"),
                PluginParameter("hold", 0.02, 0.0, 500.0, 50.0, "ms", "Gate hold time"),
                PluginParameter("release", 0.05, 1.0, 500.0, 100.0, "ms", "Gate release"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._envelope = 0.0
        self._hold_counter = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        threshold = float(self.get_parameter("threshold"))
        ratio = float(self.get_parameter("ratio"))
        attack = float(self.get_parameter("attack"))
        hold = float(self.get_parameter("hold"))
        release = float(self.get_parameter("release"))

        threshold_lin = 10 ** (threshold / 20.0)
        attack_coef = np.exp(-1.0 / (attack * self.sr / 1000.0)) if attack > 0.1 else 0.0
        release_coef = np.exp(-1.0 / (release * self.sr / 1000.0)) if release > 0.1 else 0.0
        hold_samples = int(hold * self.sr / 1000.0)

        output = samples.copy()
        env = self._envelope
        hold_ctr = self._hold_counter

        for i in range(len(samples)):
            abs_s = abs(samples[i])
            
            if abs_s > env:
                env = attack_coef * env + (1.0 - attack_coef) * abs_s
                hold_ctr = hold_samples
            else:
                if hold_ctr > 0:
                    hold_ctr -= 1
                else:
                    env = release_coef * env + (1.0 - release_coef) * abs_s

            if env < threshold_lin:
                gain = (env / threshold_lin) ** (1.0 / ratio - 1.0) if ratio > 1.0 else 0.0
                output[i] *= max(0.0, min(1.0, gain))

        self._envelope = env
        self._hold_counter = hold_ctr
        return output


@register_plugin
class DeEsser(AudioPlugin):
    """Frequency-sensitive de-esser."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="De-Esser",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Sibilance remover",
            parameters=[
                PluginParameter("frequency", 0.8, 2000.0, 12000.0, 6000.0, "Hz", "Sibilance center"),
                PluginParameter("bandwidth", 0.3, 500.0, 6000.0, 2000.0, "Hz", "Detection bandwidth"),
                PluginParameter("threshold", 0.5, -40.0, 0.0, -15.0, "dB", "Detection threshold"),
                PluginParameter("reduction", 0.5, 0.0, 1.0, 0.5, "", "Reduction amount"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._detector_env = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        bw = float(self.get_parameter("bandwidth"))
        threshold = float(self.get_parameter("threshold"))
        reduction = float(self.get_parameter("reduction"))

        threshold_lin = 10 ** (threshold / 20.0)
        low = max(20.0, freq - bw / 2)
        high = min(self.sr / 2.0 - 100, freq + bw / 2)

        from calliope.voice.deesser import deesser_mono
        processed = deesser_mono(samples, self.sr, amount=reduction)

        return processed


@register_plugin
class Expander(AudioPlugin):
    """Upward expander for dynamic expansion."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Expander",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Upward expander for dynamic range",
            parameters=[
                PluginParameter("threshold", 0.5, -60.0, 0.0, -30.0, "dB", "Expansion threshold"),
                PluginParameter("ratio", 0.3, 1.0, 10.0, 2.0, ":1", "Expansion ratio"),
                PluginParameter("attack", 0.01, 0.1, 100.0, 5.0, "ms", "Attack time"),
                PluginParameter("release", 0.1, 1.0, 500.0, 50.0, "ms", "Release time"),
                PluginParameter("floor", 0.0, -60.0, 0.0, -60.0, "dB", "Noise floor"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._envelope = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        threshold = float(self.get_parameter("threshold"))
        ratio = float(self.get_parameter("ratio"))
        attack = float(self.get_parameter("attack"))
        release = float(self.get_parameter("release"))
        floor = float(self.get_parameter("floor"))

        threshold_lin = 10 ** (threshold / 20.0)
        floor_lin = 10 ** (floor / 20.0)
        attack_coef = np.exp(-1.0 / (attack * self.sr / 1000.0)) if attack > 0.1 else 0.0
        release_coef = np.exp(-1.0 / (release * self.sr / 1000.0)) if release > 0.1 else 0.0

        output = samples.copy()
        env = self._envelope

        for i in range(len(samples)):
            abs_s = abs(samples[i])
            
            if abs_s > env:
                env = attack_coef * env + (1.0 - attack_coef) * abs_s
            else:
                env = release_coef * env + (1.0 - release_coef) * abs_s

            if env > threshold_lin:
                gain = threshold_lin / env
                gain = gain ** (1.0 - 1.0 / ratio)
                output[i] *= gain
            else:
                target = min(env, floor_lin)
                gain = target / max(env, 1e-9)
                output[i] *= gain

        self._envelope = env
        return np.clip(output, -1.0, 1.0)


@register_plugin
class SidechainCompressor(AudioPlugin):
    """Compressor with sidechain input for pumping effects."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Sidechain Compressor",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Sidechain compressor for pumping",
            parameters=[
                PluginParameter("threshold", 0.6, -60.0, 0.0, -15.0, "dB", "Sidechain threshold"),
                PluginParameter("ratio", 0.5, 1.0, 20.0, 4.0, ":1", "Compression ratio"),
                PluginParameter("attack", 0.005, 0.1, 100.0, 5.0, "ms", "Attack time"),
                PluginParameter("release", 0.1, 1.0, 500.0, 100.0, "ms", "Release time"),
                PluginParameter("makeup", 0.0, 0.0, 30.0, 6.0, "dB", "Makeup gain"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.5, "", "Sidechain depth"),
            ],
            sidechain_enabled=True,
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._sidechain_env = 0.0

    def set_sidechain(self, sidechain: np.ndarray) -> None:
        threshold = float(self.get_parameter("threshold"))
        ratio = float(self.get_parameter("ratio"))
        attack = float(self.get_parameter("attack"))
        release = float(self.get_parameter("release"))
        depth = float(self.get_parameter("depth"))

        threshold_lin = 10 ** (threshold / 20.0)
        attack_coef = np.exp(-1.0 / (attack * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (release * self.sr / 1000.0))

        env = 0.0
        for s in sidechain:
            abs_s = abs(s)
            if abs_s > env:
                env = attack_coef * env + (1.0 - attack_coef) * abs_s
            else:
                env = release_coef * env + (1.0 - release_coef) * abs_s

        if env > threshold_lin:
            gain = (threshold_lin / env) ** (1.0 - 1.0 / ratio)
            self._sidechain_env = gain * depth + (1.0 - depth)
        else:
            self._sidechain_env = 1.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        makeup = float(self.get_parameter("makeup"))
        mix = float(self.get_parameter("mix"))

        compressed = samples * self._sidechain_env

        if makeup > 0:
            compressed *= 10 ** (makeup / 20.0)

        return self._apply_mix(samples, np.clip(compressed, -1.0, 1.0))