"""EQ plugins - parametric, shelving, graphic."""

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
class ParametricEQ(AudioPlugin):
    """Parametric equalizer with 4 bands."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Parametric EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="4-band parametric equalizer",
            parameters=[
                PluginParameter("band1_freq", 0.1, 20.0, 500.0, 100.0, "Hz", "Low band frequency"),
                PluginParameter("band1_gain", 0.5, -18.0, 18.0, 0.0, "dB", "Low band gain"),
                PluginParameter("band1_q", 0.3, 0.1, 10.0, 1.0, "Q", "Low band Q"),
                PluginParameter("band2_freq", 0.3, 200.0, 2000.0, 500.0, "Hz", "Low-mid frequency"),
                PluginParameter("band2_gain", 0.5, -18.0, 18.0, 0.0, "dB", "Low-mid gain"),
                PluginParameter("band2_q", 0.4, 0.1, 10.0, 1.4, "Q", "Low-mid Q"),
                PluginParameter("band3_freq", 0.6, 1000.0, 8000.0, 3000.0, "Hz", "High-mid frequency"),
                PluginParameter("band3_gain", 0.5, -18.0, 18.0, 0.0, "dB", "High-mid gain"),
                PluginParameter("band3_q", 0.4, 0.1, 10.0, 1.4, "Q", "High-mid Q"),
                PluginParameter("band4_freq", 0.85, 4000.0, 20000.0, 10000.0, "Hz", "High band frequency"),
                PluginParameter("band4_gain", 0.5, -18.0, 18.0, 0.0, "dB", "High band gain"),
                PluginParameter("band4_q", 0.3, 0.1, 10.0, 0.8, "Q", "High band Q"),
            ],
        )

    def _peq_band(self, samples: np.ndarray, freq: float, gain_db: float, q: float) -> np.ndarray:
        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2 * q)

        b0 = 1 + alpha / A
        b1 = -2 * cos_w0
        b2 = 1 - alpha / A
        a0 = 1 + alpha * A
        a1 = -2 * cos_w0
        a2 = 1 - alpha * A

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)

    def process(self, samples: np.ndarray) -> np.ndarray:
        result = samples.copy()
        
        for band in range(1, 5):
            freq = float(self.get_parameter(f"band{band}_freq"))
            gain = float(self.get_parameter(f"band{band}_gain"))
            q = float(self.get_parameter(f"band{band}_q"))
            
            result = self._peq_band(result, freq, gain, q)
        
        return result


@register_plugin
class LowShelf(AudioPlugin):
    """Low shelf EQ filter."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Low Shelf",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Low frequency shelf boost/cut",
            parameters=[
                PluginParameter("frequency", 0.15, 20.0, 500.0, 100.0, "Hz", "Shelf frequency"),
                PluginParameter("gain", 0.5, -18.0, 18.0, 0.0, "dB", "Shelf gain"),
                PluginParameter("slope", 0.5, 0.25, 4.0, 1.0, "", "Slope (Butterworth order)"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        gain_db = float(self.get_parameter("gain"))
        slope = float(self.get_parameter("slope"))

        if abs(gain_db) < 0.1:
            return samples

        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / 2 * np.sqrt((A + 1) / slope)

        b0 = A * ((A + 1) - (A - 1) * cos_w0 + 2 * np.sqrt(A) * alpha)
        b1 = 2 * A * ((A - 1) - (A + 1) * cos_w0)
        b2 = A * ((A + 1) - (A - 1) * cos_w0 - 2 * np.sqrt(A) * alpha)
        a0 = (A + 1) + (A - 1) * cos_w0 + 2 * np.sqrt(A) * alpha
        a1 = -2 * ((A - 1) + (A + 1) * cos_w0)
        a2 = (A + 1) + (A - 1) * cos_w0 - 2 * np.sqrt(A) * alpha

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)


@register_plugin
class HighShelf(AudioPlugin):
    """High shelf EQ filter."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="High Shelf",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="High frequency shelf boost/cut",
            parameters=[
                PluginParameter("frequency", 0.7, 2000.0, 20000.0, 8000.0, "Hz", "Shelf frequency"),
                PluginParameter("gain", 0.5, -18.0, 18.0, 0.0, "dB", "Shelf gain"),
                PluginParameter("slope", 0.5, 0.25, 4.0, 1.0, "", "Slope (Butterworth order)"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        gain_db = float(self.get_parameter("gain"))
        slope = float(self.get_parameter("slope"))

        if abs(gain_db) < 0.1:
            return samples

        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / 2 * np.sqrt((A + 1) / slope)

        b0 = A * ((A + 1) + (A - 1) * cos_w0 + 2 * np.sqrt(A) * alpha)
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
        b2 = A * ((A + 1) + (A - 1) * cos_w0 - 2 * np.sqrt(A) * alpha)
        a0 = (A + 1) - (A - 1) * cos_w0 + 2 * np.sqrt(A) * alpha
        a1 = 2 * ((A - 1) - (A + 1) * cos_w0)
        a2 = (A + 1) - (A - 1) * cos_w0 - 2 * np.sqrt(A) * alpha

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)


@register_plugin
class HighPassEQ(AudioPlugin):
    """High-pass filter with slope options."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="High Pass EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="High-pass filter for rumble removal",
            parameters=[
                PluginParameter("frequency", 0.1, 20.0, 500.0, 50.0, "Hz", "Cutoff frequency"),
                PluginParameter("slope", 0.25, 6.0, 48.0, 12.0, "dB/oct", "Slope"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        slope = float(self.get_parameter("slope"))

        order = int(round(slope / 6))
        sos = signal.butter(order, freq, btype="high", output="sos", fs=self.sr)
        return signal.sosfilt(sos, samples)


@register_plugin
class LowPassEQ(AudioPlugin):
    """Low-pass filter with slope options."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Low Pass EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Low-pass filter for brightness control",
            parameters=[
                PluginParameter("frequency", 0.8, 2000.0, 20000.0, 12000.0, "Hz", "Cutoff frequency"),
                PluginParameter("slope", 0.25, 6.0, 48.0, 12.0, "dB/oct", "Slope"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        slope = float(self.get_parameter("slope"))

        order = int(round(slope / 6))
        sos = signal.butter(order, freq, btype="low", output="sos", fs=self.sr)
        return signal.sosfilt(sos, samples)


@register_plugin
class NotchEQ(AudioPlugin):
    """Narrow notch filter for problem frequencies."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Notch EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Narrow notch for hum/buzz removal",
            parameters=[
                PluginParameter("frequency", 0.5, 20.0, 20000.0, 60.0, "Hz", "Notch frequency"),
                PluginParameter("q", 0.7, 0.5, 50.0, 20.0, "Q", "Notch sharpness"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        q = float(self.get_parameter("q"))

        sos = signal.butter(2, freq, btype="notch", fs=self.sr)
        return signal.sosfilt(sos, samples)


@register_plugin
class PresenceEQ(AudioPlugin):
    """Presence EQ boost for vocal clarity."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Presence EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Presence boost for vocal clarity",
            parameters=[
                PluginParameter("frequency", 0.6, 1000.0, 8000.0, 3000.0, "Hz", "Peak frequency"),
                PluginParameter("gain", 0.5, -12.0, 12.0, 0.0, "dB", "Boost amount"),
                PluginParameter("q", 0.5, 0.5, 8.0, 2.5, "Q", "Bandwidth"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        gain_db = float(self.get_parameter("gain"))
        q = float(self.get_parameter("q"))

        if abs(gain_db) < 0.1:
            return samples

        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2 * q)

        b0 = 1 + alpha / A
        b1 = -2 * cos_w0
        b2 = 1 - alpha / A
        a0 = 1 + alpha * A
        a1 = -2 * cos_w0
        a2 = 1 - alpha * A

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)


@register_plugin
class DeEsserEQ(AudioPlugin):
    """Sibilance reduction EQ."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="De-Esser EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Reduce harsh sibilance",
            parameters=[
                PluginParameter("frequency", 0.75, 2000.0, 12000.0, 6000.0, "Hz", "Sibilance frequency"),
                PluginParameter("cut", 0.4, 0.0, 12.0, -4.0, "dB", "Reduction amount"),
                PluginParameter("q", 0.6, 0.5, 10.0, 4.0, "Q", "Bandwidth"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        cut_db = float(self.get_parameter("cut"))
        q = float(self.get_parameter("q"))

        gain_db = -abs(cut_db)
        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2 * q)

        b0 = 1 + alpha / A
        b1 = -2 * cos_w0
        b2 = 1 - alpha / A
        a0 = 1 + alpha * A
        a1 = -2 * cos_w0
        a2 = 1 - alpha * A

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)


@register_plugin
class ResonantPeak(AudioPlugin):
    """Resonant peak for creative effects."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Resonant Peak",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="Resonant peak for creative effects",
            parameters=[
                PluginParameter("frequency", 0.5, 20.0, 20000.0, 1000.0, "Hz", "Peak frequency"),
                PluginParameter("gain", 0.6, -12.0, 18.0, 6.0, "dB", "Peak gain"),
                PluginParameter("q", 0.7, 0.5, 30.0, 15.0, "Q", "Resonance"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        gain_db = float(self.get_parameter("gain"))
        q = float(self.get_parameter("q"))

        A = 10 ** (gain_db / 40.0)
        w0 = 2 * np.pi * freq / self.sr
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2 * q)

        b0 = 1 + alpha / A
        b1 = -2 * cos_w0
        b2 = 1 - alpha / A
        a0 = 1 + alpha * A
        a1 = -2 * cos_w0
        a2 = 1 - alpha * A

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)