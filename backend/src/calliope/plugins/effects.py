"""Reverb and delay effects plugins."""

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
class Reverb(AudioPlugin):
    """Algorithmic reverb with room simulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Reverb",
            version="1.0.0",
            category=PluginCategory.REVERB,
            description="Algorithmic room reverb",
            parameters=[
                PluginParameter("size", 0.5, 0.0, 1.0, 0.3, "", "Room size"),
                PluginParameter("decay", 0.5, 0.1, 10.0, 2.0, "s", "Decay time (T60)"),
                PluginParameter("damping", 0.5, 0.0, 1.0, 0.5, "", "High-freq damping"),
                PluginParameter("pre_delay", 0.0, 0.0, 100.0, 20.0, "ms", "Pre-delay"),
                PluginParameter("wet", 0.3, 0.0, 1.0, 0.3, "", "Wet amount"),
                PluginParameter("width", 1.0, 0.0, 1.0, 1.0, "", "Stereo width"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._comb_delays = []
        self._allpass_delays = []
        self._initialize_filters()

    def _initialize_filters(self) -> None:
        self._comb_delays = []
        self._allpass_delays = []

    def process(self, samples: np.ndarray) -> np.ndarray:
        size = float(self.get_parameter("size"))
        decay = float(self.get_parameter("decay"))
        damping = float(self.get_parameter("damping"))
        pre_delay = float(self.get_parameter("pre_delay"))
        wet = float(self.get_parameter("wet"))
        width = float(self.get_parameter("width"))

        if pre_delay > 0:
            delay_samples = int(pre_delay * self.sr / 1000.0)
            samples = np.concatenate([np.zeros(delay_samples), samples[:-delay_samples]])

        base_delays_ms = [29.7, 37.1, 41.1, 43.7]
        comb_delays = [int(d * size * self.sr / 1000.0) + 100 for d in base_delays_ms]

        feedback = 0.84 + (decay / 10.0) * 0.15
        feedback = min(0.98, feedback)

        damping_coef = 0.3 + damping * 0.5

        output = np.zeros_like(samples)
        
        for delay in comb_delays:
            comb_buffer = np.zeros(len(samples) + delay, dtype=np.float64)
            for i in range(len(samples)):
                comb_buffer[i] = samples[i] + feedback * comb_buffer[i] * damping_coef
            
            delayed = comb_buffer[delay : delay + len(samples)]
            output += delayed / len(comb_delays)

        allpass_delays_ms = [5.0, 1.7]
        allpass_coeff = 0.7

        for delay_ms in allpass_delays_ms:
            delay = int(delay_ms * self.sr / 1000.0) + 1
            allpass_buffer = np.zeros(len(output) + delay, dtype=np.float64)
            for i in range(len(output)):
                allpass_buffer[i + delay] = output[i] + allpass_coeff * allpass_buffer[i]
            output = allpass_buffer[:len(samples)]

        if width < 1.0 and len(samples) > 100:
            offset = int(0.5 * width * self.sr / 1000.0)
            if offset > 0 and offset < len(samples):
                shifted = np.zeros_like(output)
                shifted[offset:] = output[:-offset]
                output = (output + shifted) / 2.0

        output = np.clip(output, -1.0, 1.0)
        return samples * (1.0 - wet) + output * wet


@register_plugin
class PlateReverb(AudioPlugin):
    """Plate-style reverb with metallic character."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Plate Reverb",
            version="1.0.0",
            category=PluginCategory.REVERB,
            description="Plate-style metallic reverb",
            parameters=[
                PluginParameter("size", 0.5, 0.0, 1.0, 0.4, "", "Plate size"),
                PluginParameter("decay", 0.4, 0.1, 8.0, 1.5, "s", "Decay time"),
                PluginParameter("predelay", 0.0, 0.0, 80.0, 10.0, "ms", "Pre-delay"),
                PluginParameter("diffusion", 0.7, 0.0, 1.0, 0.7, "", "Diffusion amount"),
                PluginParameter("brightness", 0.5, 0.0, 1.0, 0.5, "", "High-freq content"),
                PluginParameter("wet", 0.35, 0.0, 1.0, 0.35, "", "Wet amount"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        size = float(self.get_parameter("size"))
        decay = float(self.get_parameter("decay"))
        predelay = float(self.get_parameter("predelay"))
        diffusion = float(self.get_parameter("diffusion"))
        brightness = float(self.get_parameter("brightness"))
        wet = float(self.get_parameter("wet"))

        if predelay > 0:
            delay_samples = int(predelay * self.sr / 1000.0)
            samples = np.concatenate([np.zeros(delay_samples), samples[:-delay_samples]])

        plate_lengths = [int(1350 * size + 200), int(1400 * size + 180), int(1200 * size + 220)]
        feedback_base = 0.7 + (decay / 8.0) * 0.25

        output = np.zeros_like(samples)
        for length in plate_lengths:
            fb = min(0.98, feedback_base + np.random.uniform(-0.02, 0.02))
            
            kernel_size = min(length, 5000)
            impulse = np.random.randn(kernel_size).astype(np.float64) * 0.01
            impulse *= np.exp(-np.arange(kernel_size) / (kernel_size * (1.0 - brightness * 0.7)))
            
            filtered = signal.lfilter(impulse, [1.0], samples)
            
            decay_curve = np.exp(-np.arange(len(filtered)) / (len(filtered) * fb))
            output += filtered * decay_curve

        output = np.clip(output / len(plate_lengths), -1.0, 1.0)
        return samples * (1.0 - wet) + output * wet


@register_plugin
class HallReverb(AudioPlugin):
    """Large hall reverb with natural decay."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Hall Reverb",
            version="1.0.0",
            category=PluginCategory.REVERB,
            description="Large concert hall reverb",
            parameters=[
                PluginParameter("size", 0.7, 0.0, 1.0, 0.6, "", "Hall size"),
                PluginParameter("decay", 0.6, 0.5, 15.0, 4.0, "s", "Decay time"),
                PluginParameter("predelay", 0.0, 0.0, 100.0, 30.0, "ms", "Pre-delay"),
                PluginParameter("mix", 0.4, 0.0, 1.0, 0.4, "", "Dry/wet mix"),
                PluginParameter("high_cut", 0.3, 1000.0, 20000.0, 8000.0, "Hz", "High-cut"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        size = float(self.get_parameter("size"))
        decay = float(self.get_parameter("decay"))
        predelay = float(self.get_parameter("predelay"))
        mix = float(self.get_parameter("mix"))
        high_cut = float(self.get_parameter("high_cut"))

        if predelay > 0:
            delay_samples = int(predelay * self.sr / 1000.0)
            samples = np.concatenate([np.zeros(delay_samples), samples[:-delay_samples]])

        from calliope.voice.reverb import schroeder_reverb_mono
        output = schroeder_reverb_mono(
            samples, self.sr,
            wet=1.0, t60=decay
        )

        if high_cut < 20000.0:
            sos = signal.butter(2, high_cut, btype="low", output="sos", fs=self.sr)
            output = signal.sosfilt(sos, output)

        return self._apply_mix(samples, np.clip(output, -1.0, 1.0))


@register_plugin
class Delay(AudioPlugin):
    """Stereo delay with feedback and modulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Delay",
            version="1.0.0",
            category=PluginCategory.DELAY,
            description="Stereo delay with feedback",
            parameters=[
                PluginParameter("time", 0.25, 1.0, 2000.0, 250.0, "ms", "Delay time"),
                PluginParameter("feedback", 0.3, 0.0, 0.95, 0.4, "", "Feedback amount"),
                PluginParameter("wet", 0.3, 0.0, 1.0, 0.3, "", "Wet amount"),
                PluginParameter("high_cut", 0.5, 500.0, 20000.0, 8000.0, "Hz", "Filter on feedback"),
                PluginParameter("ping_pong", 0.0, 0.0, 1.0, 0.0, "", "Ping-pong mode"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._delay_buffer_l = np.zeros(sr * 2)
        self._delay_buffer_r = np.zeros(sr * 2)
        self._write_pos = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        time = float(self.get_parameter("time"))
        feedback = float(self.get_parameter("feedback"))
        wet = float(self.get_parameter("wet"))
        high_cut = float(self.get_parameter("high_cut"))
        ping_pong = float(self.get_parameter("ping_pong"))

        delay_samples = int(time * self.sr / 1000.0)
        delay_samples = max(1, min(delay_samples, len(self._delay_buffer_l) - 1))

        from calliope.voice.delay_fx import feedback_delay_mono
        output = feedback_delay_mono(
            samples, self.sr,
            time_ms=time, feedback=feedback, wet=1.0
        )

        if high_cut < 20000.0:
            sos = signal.butter(2, high_cut, btype="low", output="sos", fs=self.sr)
            output = signal.sosfilt(sos, output)

        return samples * (1.0 - wet) + np.clip(output, -1.0, 1.0) * wet

    def process_stereo(self, left: np.ndarray, right: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        time = float(self.get_parameter("time"))
        feedback = float(self.get_parameter("feedback"))
        wet = float(self.get_parameter("wet"))
        ping_pong = float(self.get_parameter("ping_pong"))

        delay_samples = int(time * self.sr / 1000.0)
        delay_samples = max(1, min(delay_samples, len(self._delay_buffer_l) - 1))

        output_l = np.zeros_like(left)
        output_r = np.zeros_like(right)

        buffer_l = self._delay_buffer_l.copy()
        buffer_r = self._delay_buffer_r.copy()

        for i in range(len(left)):
            delayed_l = buffer_l[(self._write_pos - delay_samples) % len(buffer_l)]
            delayed_r = buffer_r[(self._write_pos - delay_samples) % len(buffer_r)]

            if ping_pong > 0.5:
                buffer_l[self._write_pos] = left[i] + feedback * delayed_r
                buffer_r[self._write_pos] = right[i] + feedback * delayed_l
            else:
                buffer_l[self._write_pos] = left[i] + feedback * delayed_l
                buffer_r[self._write_pos] = right[i] + feedback * delayed_r

            output_l[i] = delayed_l
            output_r[i] = delayed_r
            self._write_pos = (self._write_pos + 1) % len(buffer_l)

        self._delay_buffer_l = buffer_l
        self._delay_buffer_r = buffer_r

        output_l = np.clip(output_l, -1.0, 1.0)
        output_r = np.clip(output_r, -1.0, 1.0)

        return left * (1.0 - wet) + output_l * wet, right * (1.0 - wet) + output_r * wet


@register_plugin
class TapeDelay(AudioPlugin):
    """Warm tape-style delay with saturation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Tape Delay",
            version="1.0.0",
            category=PluginCategory.DELAY,
            description="Tape-style delay with saturation",
            parameters=[
                PluginParameter("time", 0.2, 1.0, 1500.0, 200.0, "ms", "Delay time"),
                PluginParameter("feedback", 0.25, 0.0, 0.9, 0.35, "", "Feedback amount"),
                PluginParameter("saturation", 0.2, 0.0, 1.0, 0.2, "", "Tape saturation"),
                PluginParameter("wow", 0.0, 0.0, 0.1, 0.0, "", "Wow amount"),
                PluginParameter("flutter", 0.0, 0.0, 0.1, 0.0, "", "Flutter amount"),
                PluginParameter("wet", 0.35, 0.0, 1.0, 0.35, "", "Wet amount"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._buffer = np.zeros(sr * 3)
        self._write_pos = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        time = float(self.get_parameter("time"))
        feedback = float(self.get_parameter("feedback"))
        saturation = float(self.get_parameter("saturation"))
        wow = float(self.get_parameter("wow"))
        flutter = float(self.get_parameter("flutter"))
        wet = float(self.get_parameter("wet"))

        delay_samples = int(time * self.sr / 1000.0)
        delay_samples = max(1, min(delay_samples, len(self._buffer) - 1))

        output = np.zeros_like(samples)
        
        for i in range(len(samples)):
            modulated_delay = delay_samples
            if wow > 0 or flutter > 0:
                t = i / self.sr
                mod = np.sin(2 * np.pi * 0.5 * t) * wow * 50 + np.sin(2 * np.pi * 5.0 * t) * flutter * 30
                modulated_delay = max(1, int(delay_samples + mod))

            delayed = self._buffer[(self._write_pos - modulated_delay) % len(self._buffer)]
            
            if saturation > 0:
                from calliope.voice.saturation import tape_tube_saturation
                delayed = tape_tube_saturation(np.array([delayed]), saturation, mix=1.0)[0]

            self._buffer[self._write_pos] = samples[i] + feedback * delayed
            output[i] = delayed
            
            self._write_pos = (self._write_pos + 1) % len(self._buffer)

        output = np.clip(output, -1.0, 1.0)
        return samples * (1.0 - wet) + output * wet


@register_plugin
class ReverseDelay(AudioPlugin):
    """Reverse/reverse-triggered delay effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Reverse Delay",
            version="1.0.0",
            category=PluginCategory.DELAY,
            description="Reverse delay with swells",
            parameters=[
                PluginParameter("time", 0.3, 10.0, 2000.0, 300.0, "ms", "Delay time"),
                PluginParameter("feedback", 0.4, 0.0, 0.9, 0.5, "", "Feedback amount"),
                PluginParameter("fade", 0.3, 0.0, 1.0, 0.5, "", "Fade curve"),
                PluginParameter("threshold", 0.5, -60.0, 0.0, -20.0, "dB", "Trigger threshold"),
                PluginParameter("wet", 0.4, 0.0, 1.0, 0.4, "", "Wet amount"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        time = float(self.get_parameter("time"))
        feedback = float(self.get_parameter("feedback"))
        fade = float(self.get_parameter("fade"))
        threshold = float(self.get_parameter("threshold"))
        wet = float(self.get_parameter("wet"))

        delay_samples = int(time * self.sr / 1000.0)
        delay_samples = max(1, min(delay_samples, len(samples) - 1))

        output = np.zeros_like(samples)
        threshold_lin = 10 ** (threshold / 20.0)

        for i in range(len(samples)):
            if abs(samples[i]) > threshold_lin:
                reversed_chunk = samples[max(0, i - delay_samples):i][::-1]
                if len(reversed_chunk) > 0:
                    fade_in = np.linspace(0, 1, len(reversed_chunk)) ** (1.0 - fade + 0.1)
                    output[i] = np.sum(reversed_chunk * fade_in) / len(reversed_chunk) * feedback

        return samples * (1.0 - wet) + np.clip(output, -1.0, 1.0) * wet