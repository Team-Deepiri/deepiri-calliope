"""Distortion and saturation plugins."""

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
class Saturation(AudioPlugin):
    """Tape/Tube saturation with soft clipping."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Saturation",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Warm tape/tube saturation",
            parameters=[
                PluginParameter("drive", 0.3, 0.0, 1.0, 0.3, "", "Saturation amount"),
                PluginParameter("tone", 0.5, 0.0, 1.0, 0.5, "", "Tone (dark to bright)"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        drive = float(self.get_parameter("drive"))
        tone = float(self.get_parameter("tone"))
        mix = float(self.get_parameter("mix"))

        driven = samples * (1.0 + drive * 10.0)

        clipped = np.tanh(driven) / np.tanh(1.0 + drive * 5.0)

        if tone < 0.5:
            dark = 0.5 - tone
            sos = signal.butter(2, 3000.0 * (1.0 - dark), btype="low", output="sos", fs=self.sr)
            clipped = signal.sosfilt(sos, clipped)
        elif tone > 0.5:
            bright = tone - 0.5
            sos = signal.butter(2, 8000.0 + bright * 8000.0, btype="high", output="sos", fs=self.sr)
            clipped = signal.sosfilt(sos, clipped)

        return (1.0 - mix) * samples + np.clip(clipped, -2.0, 2.0) * mix


@register_plugin
class Distortion(AudioPlugin):
    """Hard clipping distortion."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Distortion",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Hard clipping distortion",
            parameters=[
                PluginParameter("gain", 0.5, 0.0, 1.0, 0.5, "", "Input gain"),
                PluginParameter("threshold", 0.3, 0.01, 1.0, 0.3, "", "Clipping threshold"),
                PluginParameter("asymmetry", 0.0, -0.5, 0.5, 0.0, "", "Asymmetric clipping"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        gain = float(self.get_parameter("gain"))
        threshold = float(self.get_parameter("threshold"))
        asymmetry = float(self.get_parameter("asymmetry"))
        mix = float(self.get_parameter("mix"))

        driven = samples * (1.0 + gain * 20.0)

        threshold_val = threshold
        clipped_pos = np.clip(driven, 0.0, threshold_val)
        clipped_neg = np.clip(driven, -threshold_val * (1.0 + asymmetry), 0.0)

        clipped = np.where(driven >= 0, clipped_pos, clipped_neg)

        return (1.0 - mix) * samples + np.clip(clipped, -2.0, 2.0) * mix


@register_plugin
class Overdrive(AudioPlugin):
    """Smooth overdrive effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Overdrive",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Smooth overdrive pedal",
            parameters=[
                PluginParameter("gain", 0.4, 0.0, 1.0, 0.4, "", "Drive amount"),
                PluginParameter("tone", 0.5, 0.0, 1.0, 0.5, "", "Tone control"),
                PluginParameter("level", 0.5, 0.0, 1.0, 0.5, "", "Output level"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        gain = float(self.get_parameter("gain"))
        tone = float(self.get_parameter("tone"))
        level = float(self.get_parameter("level"))
        mix = float(self.get_parameter("mix"))

        driven = samples * (1.0 + gain * 8.0)

        alpha = 1.0 + gain * 3.0
        overdriven = np.where(
            np.abs(driven) <= 1.0 / alpha,
            alpha * driven - (alpha - 1.0) * driven ** 3,
            np.sign(driven) * (1.0 - 1.0 / (alpha + np.abs(driven)))
        )

        if tone < 0.5:
            sos = signal.butter(2, 3000.0 * (0.5 + tone * 2), btype="low", output="sos", fs=self.sr)
            overdriven = signal.sosfilt(sos, overdriven)
        else:
            sos = signal.butter(2, 6000.0 + tone * 6000.0, btype="high", output="sos", fs=self.sr)
            overdriven = signal.sosfilt(sos, overdriven)

        overdriven *= level * 2.0

        return (1.0 - mix) * samples + np.clip(overdriven, -1.0, 1.0) * mix


@register_plugin
class Fuzz(AudioPlugin):
    """Extreme fuzz distortion."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Fuzz",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Extreme fuzz effect",
            parameters=[
                PluginParameter("intensity", 0.5, 0.0, 1.0, 0.5, "", "Fuzz intensity"),
                PluginParameter("content", 0.5, 0.0, 1.0, 0.5, "", "High-freq content"),
                PluginParameter("gate", 0.2, 0.0, 1.0, 0.2, "", "Noise gate"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        intensity = float(self.get_parameter("intensity"))
        content = float(self.get_parameter("content"))
        gate = float(self.get_parameter("gate"))

        driven = samples * (1.0 + intensity * 30.0)

        fuzzed = np.tanh(driven) * (1.0 + intensity * 0.5)

        squared = np.sign(fuzzed) * np.minimum(np.abs(fuzzed), 1.0) ** 0.5
        fuzzed = squared * (1.0 + intensity * 0.3)

        if content < 0.5:
            sos = signal.butter(2, 2000.0 + content * 3000.0, btype="low", output="sos", fs=self.sr)
            fuzzed = signal.sosfilt(sos, fuzzed)
        else:
            sos = signal.butter(2, 5000.0 + content * 8000.0, btype="high", output="sos", fs=self.sr)
            fuzzed = signal.sosfilt(sos, fuzzed)

        if gate > 0.1:
            threshold = (1.0 - gate) * 0.3
            fuzzed[np.abs(samples) < threshold] *= 0.1

        return np.clip(fuzzed, -2.0, 2.0)


@register_plugin
class Bitcrusher(AudioPlugin):
    """Lo-fi bit crushing effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Bitcrusher",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Lo-fi bit crushing",
            parameters=[
                PluginParameter("bits", 0.8, 2.0, 16.0, 8.0, "bits", "Bit depth"),
                PluginParameter("rate", 1.0, 0.0, 1.0, 1.0, "", "Sample rate reduction"),
                PluginParameter("fold", 0.0, 0.0, 1.0, 0.0, "", "Fold over saturation"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._hold = 0.0
        self._counter = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        bits = float(self.get_parameter("bits"))
        rate = float(self.get_parameter("rate"))
        fold = float(self.get_parameter("fold"))

        if rate < 0.01:
            rate = 0.01
        sample_hold = int(rate * 0.5 * self.sr / 100.0)
        sample_hold = max(1, min(sample_hold, 1000))

        levels = 2.0 ** bits
        hold = self._hold
        counter = self._counter

        output = np.zeros_like(samples)

        for i in range(len(samples)):
            if counter <= 0:
                sample = samples[i]
                if fold > 0:
                    sample = np.sin(sample * np.pi * (1.0 + fold)) / np.sin(np.pi)
                hold = np.round(sample * levels) / levels
                counter = sample_hold
            output[i] = hold
            counter -= 1

        self._hold = hold
        self._counter = counter

        return output


@register_plugin
class Waveshaper(AudioPlugin):
    """Custom waveshaping distortion."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Waveshaper",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Custom waveshaping",
            parameters=[
                PluginParameter("curve", 0.3, 0.0, 1.0, 0.3, "", "Waveshape curve"),
                PluginParameter("drive", 0.4, 0.0, 1.0, 0.4, "", "Input drive"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def _waveshape(self, x: np.ndarray, curve: float) -> np.ndarray:
        if curve < 0.5:
            k = 1.0 + (0.5 - curve) * 10.0
            return np.tanh(k * x) / np.tanh(k)
        else:
            k = 1.0 + (curve - 0.5) * 10.0
            return np.sign(x) * (1.0 - np.exp(-np.abs(x) * k))

    def process(self, samples: np.ndarray) -> np.ndarray:
        curve = float(self.get_parameter("curve"))
        drive = float(self.get_parameter("drive"))
        mix = float(self.get_parameter("mix"))

        driven = samples * (1.0 + drive * 10.0)
        shaped = self._waveshape(driven, curve)

        return (1.0 - mix) * samples + np.clip(shaped, -2.0, 2.0) * mix


@register_plugin
class Decimator(AudioPlugin):
    """Sample rate reduction/bit depth."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Decimator",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Sample rate reduction",
            parameters=[
                PluginParameter("sample_rate", 0.7, 0.0, 1.0, 0.7, "", "Sample rate reduction"),
                PluginParameter("bit_depth", 0.6, 0.0, 1.0, 0.6, "", "Bit depth reduction"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._hold_l = 0.0
        self._hold_r = 0.0
        self._counter = 0

    def process_stereo(self, left: np.ndarray, right: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        sr_reduction = float(self.get_parameter("sample_rate"))
        bit_reduction = float(self.get_parameter("bit_depth"))
        mix = float(self.get_parameter("mix"))

        decimation = int(sr_reduction * 10.0) + 1
        bit_depth = int(bit_reduction * 14.0) + 2

        levels = 2.0 ** bit_depth
        hold_l = self._hold_l
        hold_r = self._hold_r
        counter = self._counter

        out_l = np.zeros_like(left)
        out_r = np.zeros_like(right)

        for i in range(len(left)):
            if counter <= 0:
                hold_l = np.round(left[i] * levels) / levels
                hold_r = np.round(right[i] * levels) / levels
                counter = decimation
            out_l[i] = hold_l
            out_r[i] = hold_r
            counter -= 1

        self._hold_l = hold_l
        self._hold_r = hold_r
        self._counter = counter

        left_out = left * (1.0 - mix) + out_l * mix
        right_out = right * (1.0 - mix) + out_r * mix

        return np.clip(left_out, -1.0, 1.0), np.clip(right_out, -1.0, 1.0)

    def process(self, samples: np.ndarray) -> np.ndarray:
        left_out, right_out = self.process_stereo(samples, samples)
        return (left_out + right_out) / 2.0