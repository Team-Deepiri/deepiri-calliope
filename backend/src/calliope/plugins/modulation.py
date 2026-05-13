"""Modulation plugins - chorus, flanger, phaser, tremolo, vibrato."""

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
class Chorus(AudioPlugin):
    """Chorus effect with multiple modulated delays."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Chorus",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Classic chorus effect",
            parameters=[
                PluginParameter("rate", 0.1, 0.01, 10.0, 0.5, "Hz", "LFO rate"),
                PluginParameter("depth", 0.3, 0.0, 1.0, 0.5, "", "Modulation depth"),
                PluginParameter("delay", 0.3, 0.5, 30.0, 7.0, "ms", "Base delay time"),
                PluginParameter("feedback", 0.0, -0.5, 0.5, 0.0, "", "Feedback"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 0.5, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._delay_buffer = np.zeros(int(sr * 0.05))
        self._write_pos = 0
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        base_delay = float(self.get_parameter("delay"))
        feedback = float(self.get_parameter("feedback"))
        mix = float(self.get_parameter("mix"))

        base_samples = int(base_delay * self.sr / 1000.0)
        depth_samples = int(depth * 0.01 * self.sr / 1000.0)

        output = np.zeros_like(samples)
        buffer = self._delay_buffer.copy()
        phase = self._phase

        for i in range(len(samples)):
            lfo = np.sin(2 * np.pi * phase)
            modulated_delay = base_samples + int(lfo * depth_samples)
            modulated_delay = max(1, min(modulated_delay, len(buffer) - 1))

            read_pos = (self._write_pos - modulated_delay) % len(buffer)
            delayed = buffer[read_pos]

            buffer[self._write_pos] = samples[i] + feedback * delayed
            output[i] = delayed

            self._write_pos = (self._write_pos + 1) % len(buffer)
            phase += rate / self.sr
            if phase >= 1.0:
                phase -= 1.0

        self._delay_buffer = buffer
        self._phase = phase

        return (1.0 - mix) * samples + mix * output


@register_plugin
class Flanger(AudioPlugin):
    """Flanger effect with feedback."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Flanger",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Classic flanger effect",
            parameters=[
                PluginParameter("rate", 0.15, 0.01, 10.0, 0.5, "Hz", "LFO rate"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.7, "", "Depth amount"),
                PluginParameter("feedback", 0.4, -0.95, 0.95, 0.7, "", "Feedback amount"),
                PluginParameter("delay", 0.1, 0.0, 10.0, 2.0, "ms", "Minimum delay"),
                PluginParameter("phase", 0.0, 0.0, 180.0, 0.0, "deg", "LFO phase offset"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 0.5, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._delay_buffer = np.zeros(int(sr * 0.02))
        self._write_pos = 0
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        feedback = float(self.get_parameter("feedback"))
        min_delay = float(self.get_parameter("delay"))
        phase_offset = float(self.get_parameter("phase"))
        mix = float(self.get_parameter("mix"))

        min_samples = int(min_delay * self.sr / 1000.0) + 1
        max_depth = int(depth * 0.01 * self.sr / 1000.0)

        output = np.zeros_like(samples)
        buffer = self._delay_buffer.copy()
        phase = self._phase
        phase_rad = np.radians(phase_offset)

        for i in range(len(samples)):
            lfo = np.sin(2 * np.pi * phase + phase_rad)
            modulated_delay = min_samples + int((lfo + 1.0) * 0.5 * max_depth)
            modulated_delay = max(1, min(modulated_delay, len(buffer) - 1))

            read_pos = (self._write_pos - modulated_delay) % len(buffer)
            delayed = buffer[read_pos]

            buffer[self._write_pos] = samples[i] + feedback * delayed
            output[i] = delayed

            self._write_pos = (self._write_pos + 1) % len(buffer)
            phase += rate / self.sr
            if phase >= 1.0:
                phase -= 1.0

        self._delay_buffer = buffer
        self._phase = phase

        return (1.0 - mix) * samples + mix * output


@register_plugin
class Phaser(AudioPlugin):
    """Phaser effect with allpass filters."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Phaser",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Classic phaser effect",
            parameters=[
                PluginParameter("rate", 0.1, 0.01, 10.0, 0.3, "Hz", "LFO rate"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.8, "", "Modulation depth"),
                PluginParameter("frequency", 0.5, 100.0, 8000.0, 1000.0, "Hz", "Base frequency"),
                PluginParameter("stages", 4.0, 2.0, 12.0, 4.0, "", "Number of stages"),
                PluginParameter("feedback", 0.0, 0.0, 0.9, 0.0, "", "Feedback amount"),
                PluginParameter("mix", 1.0, 0.0, 1.0, 0.5, "", "Dry/wet mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._phase = 0.0

    def _allpass(self, samples: np.ndarray, freq: float, q: float = 0.7) -> np.ndarray:
        w = 2 * np.pi * freq / self.sr
        cos_w = np.cos(w)
        alpha = np.sin(w) / (2 * q)
        
        b0 = 1 - alpha
        b1 = -2 * cos_w
        b2 = 1 + alpha
        a0 = 1 + alpha
        a1 = -2 * cos_w
        a2 = 1 - alpha

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])

        return signal.lfilter(b, a, samples)

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        base_freq = float(self.get_parameter("frequency"))
        stages = int(self.get_parameter("stages"))
        feedback = float(self.get_parameter("feedback"))
        mix = float(self.get_parameter("mix"))

        output = samples.copy()
        phase = self._phase

        for i in range(len(samples)):
            lfo = np.sin(2 * np.pi * phase)
            freq = base_freq * (1.0 + depth * lfo)
            freq = max(20.0, min(freq, self.sr / 2.0 - 100.0))

            sample = output[i] + feedback * output[i]
            for _ in range(stages):
                sample = self._allpass(np.array([sample]), freq, q=0.7)[0]
            output[i] = sample

            phase += rate / self.sr
            if phase >= 1.0:
                phase -= 1.0

        self._phase = phase

        return (1.0 - mix) * samples + mix * np.clip(output, -1.5, 1.5)


@register_plugin
class Tremolo(AudioPlugin):
    """Tremolo effect with amplitude modulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Tremolo",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Amplitude tremolo effect",
            parameters=[
                PluginParameter("rate", 2.0, 0.1, 20.0, 4.0, "Hz", "Tremolo rate"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.6, "", "Modulation depth"),
                PluginParameter("shape", 0.0, 0.0, 1.0, 0.0, "", "Sine (0) to square (1)"),
                PluginParameter("sync", 0.0, 0.0, 1.0, 0.0, "", "Sync to tempo"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        shape = float(self.get_parameter("shape"))

        output = np.zeros_like(samples)
        phase = self._phase
        t = np.arange(len(samples), dtype=np.float64) / self.sr

        if shape < 0.05:
            lfo = np.sin(2 * np.pi * rate * t)
        elif shape > 0.95:
            lfo = np.sign(np.sin(2 * np.pi * rate * t))
        else:
            sine_lfo = np.sin(2 * np.pi * rate * t)
            square_lfo = np.sign(sine_lfo)
            lfo = (1.0 - shape) * sine_lfo + shape * square_lfo

        modulation = 1.0 - depth * (lfo * 0.5 + 0.5)
        output = samples * modulation

        self._phase = (rate / self.sr * len(samples)) % 1.0

        return output


@register_plugin
class Vibrato(AudioPlugin):
    """Vibrato effect with pitch modulation."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Vibrato",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Pitch vibrato effect",
            parameters=[
                PluginParameter("rate", 4.0, 0.5, 30.0, 5.0, "Hz", "Vibrato rate"),
                PluginParameter("depth", 0.3, 0.0, 1.0, 0.3, "", "Pitch modulation depth"),
                PluginParameter("delay", 0.0, 0.0, 50.0, 0.0, "ms", "Vibrato delay"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        delay_ms = float(self.get_parameter("delay"))

        if delay_ms > 0:
            delay_samples = int(delay_ms * self.sr / 1000.0)
            samples = np.concatenate([np.zeros(delay_samples), samples[:-delay_samples]])

        from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
        
        max_semitones = depth * 12.0
        max_depth = max_semitones / 12.0

        frame_size = 2048
        hop = 512
        n_frames = (len(samples) - frame_size) // hop + 1
        phases = np.linspace(0, 1, n_frames) if n_frames > 1 else np.array([0.0])

        lfo = np.sin(2 * np.pi * phases)
        semitones = max_semitones * lfo

        output = np.zeros_like(samples)
        for i, s in enumerate(semitones):
            if abs(s) > 0.01:
                frame = samples[i * hop : i * hop + frame_size]
                shifted = pitch_shift_phase_vocoder(frame, self.sr, s, n_fft=2048, hop_length=512)
                
                end = min((i + 1) * hop + frame_size, len(output))
                start = i * hop
                if len(shifted) <= end - start:
                    output[start:end] = shifted[:end - start]

        if delay_ms > 0:
            delay_samples = int(delay_ms * self.sr / 1000.0)
            output = output[delay_samples:]

        return np.clip(output, -1.5, 1.5)


@register_plugin
class AutoPan(AudioPlugin):
    """Auto-pan effect for stereo movement."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Auto Pan",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Automatic panning effect",
            parameters=[
                PluginParameter("rate", 0.5, 0.01, 10.0, 0.5, "Hz", "Pan rate"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.8, "", "Pan depth"),
                PluginParameter("shape", 0.0, 0.0, 1.0, 0.0, "", "Sine to triangle"),
            ],
        )

    def process_stereo(self, left: np.ndarray, right: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        shape = float(self.get_parameter("shape"))

        t = np.arange(len(left), dtype=np.float64) / self.sr

        if shape < 0.3:
            pan = np.sin(2 * np.pi * rate * t)
        else:
            pan = 2 * np.abs(2 * (t * rate % 1) - 1) - 1

        pan = pan * depth * 0.5 + 0.5
        pan = np.clip(pan, 0.0, 1.0)

        left_gain = pan
        right_gain = 1.0 - pan

        return left * left_gain, right * right_gain


@register_plugin
class RingModulator(AudioPlugin):
    """Ring modulator for metallic tones."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Ring Modulator",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Ring modulation effect",
            parameters=[
                PluginParameter("frequency", 0.5, 20.0, 20000.0, 440.0, "Hz", "Modulator frequency"),
                PluginParameter("mix", 0.5, 0.0, 1.0, 0.5, "", "Modulation amount"),
                PluginParameter("sync", 0.0, 0.0, 1.0, 0.0, "", "Sync to input pitch"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._phase = 0.0

    def process(self, samples: np.ndarray) -> np.ndarray:
        freq = float(self.get_parameter("frequency"))
        mix = float(self.get_parameter("mix"))

        t = np.arange(len(samples), dtype=np.float64) / self.sr
        modulator = np.sin(2 * np.pi * freq * t)

        modulated = samples * modulator
        return samples * (1.0 - mix) + modulated * mix


@register_plugin
class Slicer(AudioPlugin):
    """Rhythmic audio slicer."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Slicer",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Rhythmic slice effect",
            parameters=[
                PluginParameter("rate", 0.25, 0.01, 1.0, 0.25, "", "Slice rate (1/4, 1/8, etc)"),
                PluginParameter("depth", 0.5, 0.0, 1.0, 0.5, "", "Slice depth"),
                PluginParameter("offset", 0.0, 0.0, 1.0, 0.0, "", "Timing offset"),
                PluginParameter("reverse", 0.0, 0.0, 1.0, 0.0, "", "Reverse probability"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        rate = float(self.get_parameter("rate"))
        depth = float(self.get_parameter("depth"))
        offset = float(self.get_parameter("offset"))

        beat_samples = int(self.sr / rate)
        offset_samples = int(beat_samples * offset)

        output = samples.copy()
        slice_len = beat_samples // 2

        for i in range(0, len(samples) - slice_len, beat_samples):
            slice_start = (i + offset_samples) % len(samples)
            slice_end = min(slice_start + slice_len, len(samples))
            
            actual_start = i
            actual_end = min(i + slice_len, len(samples))
            
            chunk = output[actual_start:actual_end].copy()
            
            depth_factor = 1.0 - depth * 0.5
            envelope = np.ones_like(chunk, dtype=np.float64)
            attack = min(int(len(envelope) * 0.1), 100)
            release = min(int(len(envelope) * 0.3), 200)
            
            for j in range(attack):
                envelope[j] = j / attack
            for j in range(release):
                envelope[-(j + 1)] = j / release
            
            output[actual_start:actual_end] = chunk * envelope

        return output