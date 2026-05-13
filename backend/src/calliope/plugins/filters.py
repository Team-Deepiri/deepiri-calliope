"""Filter plugins - LP, HP, BP, shelf, notch."""

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
class LowPassFilter(AudioPlugin):
    """Resonant low-pass filter with cutoff and resonance controls."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Low Pass Filter",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Classic resonant low-pass filter",
            parameters=[
                PluginParameter("cutoff", 0.5, 20.0, 20000.0, 500.0, "Hz", "Filter cutoff frequency"),
                PluginParameter("resonance", 0.3, 0.1, 20.0, 2.0, "Q", "Filter resonance"),
                PluginParameter("drive", 0.0, 0.0, 1.0, 0.0, "", "Input saturation"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._prev_cutoff = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        cutoff = float(self.get_parameter("cutoff"))
        resonance = float(self.get_parameter("resonance"))
        drive = float(self.get_parameter("drive"))
        mix = float(self.get_parameter("mix"))

        if drive > 0.01:
            from calliope.voice.saturation import tape_tube_saturation
            samples = tape_tube_saturation(samples, drive * 0.5, mix=0.0)

        cutoff = max(20.0, min(cutoff, self.sr / 2.0 - 100.0))
        sos = signal.butter(4, cutoff, btype="low", output="sos", fs=self.sr)
        filtered = signal.sosfilt(sos, samples)

        return self._apply_mix(samples, filtered)


@register_plugin
class HighPassFilter(AudioPlugin):
    """Resonant high-pass filter."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="High Pass Filter",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Classic resonant high-pass filter",
            parameters=[
                PluginParameter("cutoff", 0.05, 20.0, 20000.0, 200.0, "Hz", "Filter cutoff frequency"),
                PluginParameter("resonance", 0.3, 0.1, 20.0, 1.0, "Q", "Filter resonance"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        cutoff = float(self.get_parameter("cutoff"))
        resonance = float(self.get_parameter("resonance"))

        cutoff = max(20.0, min(cutoff, self.sr / 2.0 - 100.0))
        sos = signal.butter(4, cutoff, btype="high", output="sos", fs=self.sr)
        filtered = signal.sosfilt(sos, samples)

        return self._apply_mix(samples, filtered)


@register_plugin
class BandPassFilter(AudioPlugin):
    """Band-pass filter with center frequency and bandwidth."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Band Pass Filter",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Narrow band-pass filter for isolation",
            parameters=[
                PluginParameter("center", 0.5, 20.0, 20000.0, 1000.0, "Hz", "Center frequency"),
                PluginParameter("bandwidth", 0.1, 10.0, 10000.0, 200.0, "Hz", "Bandwidth"),
                PluginParameter("gain", 0.0, -24.0, 24.0, 0.0, "dB", "Peak gain"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        center = float(self.get_parameter("center"))
        bandwidth = float(self.get_parameter("bandwidth"))
        gain_db = float(self.get_parameter("gain"))

        low = max(20.0, center - bandwidth / 2)
        high = min(self.sr / 2.0 - 100, center + bandwidth / 2)

        sos = signal.butter(2, [low, high], btype="band", output="sos", fs=self.sr)
        filtered = signal.sosfilt(sos, samples)

        if abs(gain_db) > 0.1:
            filtered *= 10 ** (gain_db / 20.0)

        return self._apply_mix(samples, filtered)


@register_plugin
class NotchFilter(AudioPlugin):
    """Narrow notch filter for removing specific frequencies."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Notch Filter",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Narrow notch filter for hum/buzz removal",
            parameters=[
                PluginParameter("frequency", 0.5, 20.0, 20000.0, 60.0, "Hz", "Notch center frequency"),
                PluginParameter("q", 5.0, 0.5, 50.0, 10.0, "Q", "Notch sharpness"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        q = float(self.get_parameter("q"))

        sos = signal.butter(2, freq, btype="notch", output="sos", fs=self.sr, analog=False)
        filtered = signal.sosfilt(sos, samples)

        return self._apply_mix(samples, filtered)


@register_plugin
class ResonantSweep(AudioPlugin):
    """Resonant sweep filter with envelope modulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Resonant Sweep",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Resonant sweep with LFO modulation",
            parameters=[
                PluginParameter("start_freq", 0.1, 20.0, 20000.0, 200.0, "Hz", "Starting frequency"),
                PluginParameter("end_freq", 0.8, 20.0, 20000.0, 4000.0, "Hz", "Ending frequency"),
                PluginParameter("resonance", 0.5, 0.5, 30.0, 10.0, "Q", "Resonance amount"),
                PluginParameter("attack", 0.0, 0.0, 2.0, 0.1, "s", "Sweep attack time"),
                PluginParameter("release", 0.0, 0.0, 5.0, 0.5, "s", "Sweep release time"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        start_freq = float(self.get_parameter("start_freq"))
        end_freq = float(self.get_parameter("end_freq"))
        resonance = float(self.get_parameter("resonance"))
        attack = float(self.get_parameter("attack"))
        release = float(self.get_parameter("release"))
        mix = float(self.get_parameter("mix"))

        n = samples.size
        t = np.arange(n, dtype=np.float64) / self.sr

        total_time = n / self.sr
        attack_samples = int(attack * self.sr)
        release_samples = int(release * self.sr)

        env = np.ones(n, dtype=np.float64)
        if attack_samples > 0:
            attack_idx = min(attack_samples, n)
            env[:attack_idx] = np.linspace(0, 1, attack_idx)
        
        if release_samples > 0 and release_samples < n:
            release_start = n - release_samples
            env[release_start:] = np.linspace(1, 0, release_samples)

        freq_curve = start_freq + (end_freq - start_freq) * env
        freq_curve = np.clip(freq_curve, 20.0, self.sr / 2.0 - 100.0)

        frame_size = 2048
        hop = 512
        output = np.zeros(n, dtype=np.float64)

        for i in range(0, n - frame_size, hop):
            frame = samples[i : i + frame_size]
            frame_freq = float(np.mean(freq_curve[i : i + hop]))

            sos = signal.butter(4, frame_freq, btype="low", output="sos", fs=self.sr)
            filtered_frame = signal.sosfilt(sos, frame)
            output[i : i + frame_size] = filtered_frame

        return (1.0 - mix) * samples + mix * output


@register_plugin
class CombFilter(AudioPlugin):
    """Comb filter for metallic/flangey tones."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Comb Filter",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Comb filter for metallic tones",
            parameters=[
                PluginParameter("delay", 0.5, 0.1, 50.0, 1.0, "ms", "Comb delay time"),
                PluginParameter("feedback", 0.3, -0.99, 0.99, 0.5, "", "Feedback amount"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet mix"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        delay_ms = float(self.get_parameter("delay"))
        feedback = float(self.get_parameter("feedback"))
        mix = float(self.get_parameter("mix"))

        delay_samples = int(delay_ms * self.sr / 1000.0)
        delay_samples = max(1, min(delay_samples, len(samples) - 1))

        output = samples.copy()
        for i in range(delay_samples, len(samples)):
            output[i] += feedback * output[i - delay_samples]

        output = np.clip(output, -2.0, 2.0)
        return (1.0 - mix) * samples + mix * output