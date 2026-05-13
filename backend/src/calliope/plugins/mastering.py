"""More audio plugins - mastering, specialty effects."""

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
class MultiBandCompressor(AudioPlugin):
    """4-band multi-band compressor."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Multi-Band Compressor",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="4-band dynamics processor",
            parameters=[
                PluginParameter("freq1", 0.15, 20.0, 500.0, 100.0, "Hz", "Band 1 cutoff"),
                PluginParameter("freq2", 0.35, 200.0, 2000.0, 800.0, "Hz", "Band 2 cutoff"),
                PluginParameter("freq3", 0.65, 1000.0, 8000.0, 4000.0, "Hz", "Band 3 cutoff"),
                PluginParameter("threshold1", 0.7, -60.0, 0.0, -15.0, "dB", "Band 1 threshold"),
                PluginParameter("threshold2", 0.7, -60.0, 0.0, -18.0, "dB", "Band 2 threshold"),
                PluginParameter("threshold3", 0.7, -60.0, 0.0, -15.0, "dB", "Band 3 threshold"),
                PluginParameter("threshold4", 0.7, -60.0, 0.0, -12.0, "dB", "Band 4 threshold"),
                PluginParameter("ratio1", 0.4, 1.0, 10.0, 3.0, ":1", "Band 1 ratio"),
                PluginParameter("ratio2", 0.4, 1.0, 10.0, 4.0, ":1", "Band 2 ratio"),
                PluginParameter("ratio3", 0.4, 1.0, 10.0, 3.0, ":1", "Band 3 ratio"),
                PluginParameter("ratio4", 0.4, 1.0, 10.0, 6.0, ":1", "Band 4 ratio"),
                PluginParameter("attack", 0.1, 0.1, 100.0, 10.0, "ms", "Attack"),
                PluginParameter("release", 0.3, 10.0, 500.0, 100.0, "ms", "Release"),
                PluginParameter("makeup", 0.3, 0.0, 24.0, 0.0, "dB", "Makeup gain"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._envelopes = [0.0] * 4

    def _split_bands(self, y: np.ndarray) -> list[np.ndarray]:
        f1 = float(self.get_parameter("freq1"))
        f2 = float(self.get_parameter("freq2"))
        f3 = float(self.get_parameter("freq3"))
        
        sos1 = signal.butter(4, f1, btype='low', output='sos', fs=self.sr)
        sos2 = signal.butter(4, [f1, f2], btype='band', output='sos', fs=self.sr)
        sos3 = signal.butter(4, [f2, f3], btype='band', output='sos', fs=self.sr)
        sos4 = signal.butter(4, f3, btype='high', output='sos', fs=self.sr)
        
        return [
            signal.sosfilt(sos1, y),
            signal.sosfilt(sos2, y),
            signal.sosfilt(sos3, y),
            signal.sosfilt(sos4, y),
        ]

    def process(self, samples: np.ndarray) -> np.ndarray:
        thresholds = [float(self.get_parameter(f"threshold{i}")) for i in range(1, 5)]
        ratios = [float(self.get_parameter(f"ratio{i}")) for i in range(1, 5)]
        attack = float(self.get_parameter("attack"))
        release = float(self.get_parameter("release"))
        makeup = float(self.get_parameter("makeup"))

        bands = self._split_bands(samples)
        
        attack_coef = np.exp(-1.0 / (attack * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (release * self.sr / 1000.0))
        
        result = np.zeros_like(samples)
        
        for i, (band, threshold, ratio) in enumerate(zip(bands, thresholds, ratios)):
            rms = np.sqrt(np.mean(band ** 2))
            level_db = -60.0 if rms < 1e-6 else 20.0 * np.log10(rms)
            
            env = self._envelopes[i]
            if level_db > env:
                env = attack_coef * env + (1 - attack_coef) * level_db
            else:
                env = release_coef * env + (1 - release_coef) * level_db
            
            self._envelopes[i] = env
            
            if level_db > threshold:
                gain_reduction = (level_db - threshold) * (1 - 1 / ratio)
                gain = 10 ** (-gain_reduction / 20.0)
            else:
                gain = 1.0
            
            result += band * gain
        
        if makeup > 0:
            result *= 10 ** (makeup / 20.0)
        
        return np.clip(result, -1.0, 1.0).astype(np.float64)


@register_plugin
class Exciter(AudioPlugin):
    """Harmonic exciter for brightness enhancement."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Exciter",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Harmonic exciter for added brightness",
            parameters=[
                PluginParameter("frequency", 0.7, 1000.0, 15000.0, 8000.0, "Hz", "Harmonic band"),
                PluginParameter("amount", 0.5, 0.0, 1.0, 0.5, "", "Excitation amount"),
                PluginParameter("blend", 0.3, 0.0, 1.0, 0.3, "", "Dry/wet"),
                PluginParameter("odd_only", 0.0, 0.0, 1.0, 0.0, "", "Odd harmonics only"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        amount = float(self.get_parameter("amount"))
        blend = float(self.get_parameter("blend"))
        odd_only = float(self.get_parameter("odd_only")) > 0.5

        sos = signal.butter(2, freq, btype='high', output='sos', fs=self.sr)
        high = signal.sosfilt(sos, samples)

        driven = np.tanh(high * (1 + amount * 10))

        if odd_only:
            harmonic = driven
        else:
            sos2 = signal.butter(1, freq * 2, btype='low', output='sos', fs=self.sr)
            harmonic = signal.sosfilt(sos2, driven)

        return ((1 - blend) * samples + blend * harmonic).astype(np.float64)


@register_plugin
class StereoEnhancer(AudioPlugin):
    """Mid-side stereo enhancement."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Stereo Enhancer",
            version="1.0.0",
            category=PluginCategory.UTILITY,
            description="M/S stereo widening and enhancement",
            parameters=[
                PluginParameter("width", 0.5, 0.0, 2.0, 1.0, "", "Stereo width"),
                PluginParameter("mid_level", 0.5, 0.0, 2.0, 1.0, "", "Mid level"),
                PluginParameter("side_level", 0.5, 0.0, 2.0, 1.0, "", "Side level"),
                PluginParameter("rotate", 0.0, -45.0, 45.0, 0.0, "deg", "Stereo rotation"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        width = float(self.get_parameter("width"))
        mid_level = float(self.get_parameter("mid_level"))
        side_level = float(self.get_parameter("side_level"))
        rotate = float(self.get_parameter("rotate"))

        mid = samples.copy()
        side = np.roll(samples, 1) * 0.5 - np.roll(samples, -1) * 0.5
        
        mid_processed = mid * mid_level
        side_processed = side * side_level * width

        rotate_rad = np.radians(rotate)
        cos_r = np.cos(rotate_rad)
        sin_r = np.sin(rotate_rad)
        
        left = cos_r * mid_processed + sin_r * side_processed
        right = cos_r * mid_processed - sin_r * side_processed

        return ((left + right) / 2).astype(np.float64)

    def process_stereo(self, left: np.ndarray, right: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        width = float(self.get_parameter("width"))
        mid_level = float(self.get_parameter("mid_level"))
        side_level = float(self.get_parameter("side_level"))

        mid = (left + right) / 2
        side = (left - right) / 2

        mid_out = mid * mid_level
        side_out = side * side_level * width

        return (mid_out + side_out, mid_out - side_out)


@register_plugin
class Clipper(AudioPlugin):
    """Brickwall clipper/limiter."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Brickwall Clipper",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Transparent brickwall limiting",
            parameters=[
                PluginParameter("ceiling", 0.95, -6.0, 0.0, -0.3, "dB", "Output ceiling"),
                PluginParameter("attack", 0.0, 0.0, 10.0, 0.0, "ms", "Look-ahead"),
                PluginParameter("release", 0.1, 1.0, 200.0, 50.0, "ms", "Release"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        ceiling_db = float(self.get_parameter("ceiling"))
        release_ms = float(self.get_parameter("release"))
        
        ceiling = 10 ** (ceiling_db / 20.0)
        
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000.0))
        
        output = np.zeros_like(samples)
        gain = 1.0
        
        for i in range(len(samples)):
            abs_s = abs(samples[i])
            
            target_gain = 1.0
            if abs_s * gain > ceiling:
                target_gain = ceiling / (abs_s + 1e-10)
            
            if target_gain < gain:
                gain = target_gain
            else:
                gain = release_coef * gain + (1 - release_coef) * target_gain
            
            output[i] = samples[i] * gain
        
        return np.clip(output, -ceiling, ceiling).astype(np.float64)


@register_plugin
class HaasEffect(AudioPlugin):
    """Haas effect for pre-delay based stereo widening."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Haas Effect",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Haas effect for spatial enhancement",
            parameters=[
                PluginParameter("delay", 0.3, 0.0, 50.0, 15.0, "ms", "Delay time"),
                PluginParameter("pan", 0.5, -1.0, 1.0, 0.0, "", "Pan position"),
                PluginParameter("filter", 0.3, 0.0, 1.0, 0.0, "", "High-cut filter"),
                PluginParameter("level", 0.5, 0.0, 1.0, 0.5, "", "Effect level"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        delay_ms = float(self.get_parameter("delay"))
        pan = float(self.get_parameter("pan"))
        filter_amt = float(self.get_parameter("filter"))
        level = float(self.get_parameter("level"))

        delay_samples = int(delay_ms * self.sr / 1000.0)

        delayed = np.zeros_like(samples)
        if delay_samples > 0:
            delayed[delay_samples:] = samples[:-delay_samples]

        if filter_amt > 0:
            sos = signal.butter(1, 10000 * (1 - filter_amt), btype='low', output='sos', fs=self.sr)
            delayed = signal.sosfilt(sos, delayed)

        left_gain = max(0, 0.5 - pan * 0.5)
        right_gain = max(0, 0.5 + pan * 0.5)

        stereo = np.stack([samples + delayed * left_gain * level, samples + delayed * right_gain * level])
        return np.mean(stereo, axis=0).astype(np.float64)


@register_plugin
class SubBassSynth(AudioPlugin):
    """Sub bass synthesizer from harmonics."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Sub Bass Synth",
            version="1.0.0",
            category=PluginCategory.UTILITY,
            description="Generate sub bass from upper harmonics",
            parameters=[
                PluginParameter("frequency", 0.1, 30.0, 120.0, 60.0, "Hz", "Sub frequency"),
                PluginParameter("amount", 0.5, 0.0, 1.0, 0.5, "", "Sub amount"),
                PluginParameter("harmonic", 0.3, 1.0, 3.0, 1.0, "", "Harmonic multiplier"),
                PluginParameter("mix", 0.5, 0.0, 1.0, 0.5, "", "Dry/wet"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        amount = float(self.get_parameter("amount"))
        harmonic = float(self.get_parameter("harmonic"))
        mix = float(self.get_parameter("mix"))

        t = np.arange(len(samples), dtype=np.float64) / self.sr
        
        sub = np.sin(2 * np.pi * freq * t)
        
        harm_freq = freq * harmonic
        if harm_freq < 200:
            harm = np.sin(2 * np.pi * harm_freq * t) * 0.5
        
        envelope = np.abs(samples)
        sos = signal.butter(2, 5.0, btype='low', output='sos', fs=self.sr)
        env = signal.sosfilt(sos, envelope)

        sub_amount = sub * env * amount
        if harm_freq < 200:
            sub_amount += harm * env * amount * 0.3

        return ((1 - mix) * samples + mix * sub_amount).astype(np.float64)


@register_plugin
class VintageEmulator(AudioPlugin):
    """Vintage tape/channel strip emulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Vintage Emulator",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Vintage tape/channel strip character",
            parameters=[
                PluginParameter("drive", 0.3, 0.0, 1.0, 0.2, "", "Tape drive"),
                PluginParameter("saturation", 0.4, 0.0, 1.0, 0.3, "", "Saturation"),
                PluginParameter("wow", 0.0, 0.0, 0.1, 0.0, "", "Wow amount"),
                PluginParameter("flutter", 0.0, 0.0, 0.1, 0.0, "", "Flutter amount"),
                PluginParameter("high_loss", 0.2, 0.0, 1.0, 0.1, "", "High-freq loss"),
                PluginParameter("noise", 0.0, 0.0, 0.1, 0.0, "", "Tape noise"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        drive = float(self.get_parameter("drive"))
        sat = float(self.get_parameter("saturation"))
        wow = float(self.get_parameter("wow"))
        flutter = float(self.get_parameter("flutter"))
        high_loss = float(self.get_parameter("high_loss"))
        noise = float(self.get_parameter("noise"))

        driven = samples * (1 + drive * 8)

        if sat > 0.1:
            alpha = 1 + sat * 5
            processed = np.where(
                np.abs(driven) <= 1 / alpha,
                alpha * driven - (alpha - 1) * driven ** 3,
                np.sign(driven) * (1 - 1 / (alpha + np.abs(driven)))
            )
        else:
            processed = np.tanh(driven)

        if high_loss > 0:
            cutoff = 15000 * (1 - high_loss * 0.8)
            sos = signal.butter(2, cutoff, btype='low', output='sos', fs=self.sr)
            processed = signal.sosfilt(sos, processed)

        if wow > 0 or flutter > 0:
            t = np.arange(len(samples), dtype=np.float64) / self.sr
            mod = np.sin(2 * np.pi * 0.5 * t) * wow * 50 + np.sin(2 * np.pi * 8 * t) * flutter * 30
            delay = np.round(mod).astype(int)
            delayed = np.zeros_like(processed)
            for i in range(len(processed)):
                idx = max(0, min(i + delay[i], len(processed) - 1))
                delayed[i] = processed[idx]
            processed = delayed

        if noise > 0:
            tape_noise = np.random.randn(len(samples)) * noise * 0.01
            sos_hp = signal.butter(2, 500, btype='high', output='sos', fs=self.sr)
            tape_noise = signal.sosfilt(sos_hp, tape_noise)
            processed = processed + tape_noise

        return np.clip(processed, -1.5, 1.5).astype(np.float64)


@register_plugin
class DeEsserPro(AudioPlugin):
    """Pro de-esser with frequency analyzer."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Pro De-Esser",
            version="1.0.0",
            category=PluginCategory.DYNAMICS,
            description="Multi-band sibilance reducer",
            parameters=[
                PluginParameter("frequency", 0.8, 2000.0, 12000.0, 6500.0, "Hz", "Sibilance freq"),
                PluginParameter("q", 0.5, 0.5, 10.0, 3.0, "Q", "Bandwidth"),
                PluginParameter("threshold", 0.5, -40.0, 0.0, -15.0, "dB", "Threshold"),
                PluginParameter("reduction", 0.6, 0.0, 1.0, 0.6, "", "Reduction"),
                PluginParameter("ceiling", 0.0, -12.0, 0.0, -3.0, "dB", "Output ceiling"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._envelope = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        q = float(self.get_parameter("q"))
        threshold = float(self.get_parameter("threshold"))
        reduction = float(self.get_parameter("reduction"))
        ceiling = float(self.get_parameter("ceiling"))

        threshold_lin = 10 ** (threshold / 20.0)
        ceiling_lin = 10 ** (ceiling / 20.0)

        sos_detect = signal.butter(2, [freq - 500, freq + 1500], btype='band', output='sos', fs=self.sr)
        detected = signal.sosfilt(sos_detect, samples)

        env = np.sqrt(np.mean(detected ** 2))
        
        attack_coef = np.exp(-1.0 / (0.5 * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (20.0 * self.sr / 1000.0))
        
        if env > self._envelope:
            self._envelope = attack_coef * self._envelope + (1 - attack_coef) * env
        else:
            self._envelope = release_coef * self._envelope + (1 - release_coef) * env

        if self._envelope > threshold_lin:
            amount = (self._envelope - threshold_lin) / (1 - threshold_lin + 1e-10)
            gain = 1 - amount * reduction * 0.8
        else:
            gain = 1.0

        output = samples * gain
        
        if ceiling_lin < 1.0:
            output = np.clip(output, -ceiling_lin, ceiling_lin)

        return output.astype(np.float64)