"""More advanced plugins - spatial, time-based effects."""

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
class ShimmerVerb(AudioPlugin):
    """Shimmer reverb with pitch-shifted harmonics."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Shimmer Verb",
            version="1.0.0",
            category=PluginCategory.REVERB,
            description="Shimmer pitch-shifted reverb",
            parameters=[
                PluginParameter("size", 0.6, 0.0, 1.0, 0.5, "", "Room size"),
                PluginParameter("decay", 0.5, 0.1, 10.0, 3.0, "s", "Decay time"),
                PluginParameter("shimmer_oct", 0.4, 1.0, 5.0, 2.0, "", "Shimmer octaves"),
                PluginParameter("shimmer_mix", 0.3, 0.0, 1.0, 0.3, "", "Shimmer amount"),
                PluginParameter("pre_delay", 0.1, 0.0, 100.0, 20.0, "ms", "Pre-delay"),
                PluginParameter("damping", 0.5, 0.0, 1.0, 0.4, "", "High-freq damping"),
                PluginParameter("wet", 0.4, 0.0, 1.0, 0.4, "", "Wet amount"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.voice.advanced_reverb import ShimmerReverb
        reverb = ShimmerReverb(self.sr)
        return reverb.process(samples)


@register_plugin
class GatedVerb(AudioPlugin):
    """Classic gated reverb."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Gated Verb",
            version="1.0.0",
            category=PluginCategory.REVERB,
            description="80s gated reverb",
            parameters=[
                PluginParameter("threshold", 0.3, 0.0, 1.0, 0.2, "", "Gate threshold"),
                PluginParameter("decay", 0.5, 0.1, 8.0, 2.5, "s", "Decay time"),
                PluginParameter("predelay", 0.0, 0.0, 50.0, 0.0, "ms", "Pre-delay"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.voice.advanced_reverb import GatedReverb
        reverb = GatedReverb(self.sr)
        return reverb.process(samples)


@register_plugin
class GrainCloud(AudioPlugin):
    """Granular cloud effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Grain Cloud",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Granular cloud texture",
            parameters=[
                PluginParameter("grain_size", 0.3, 5.0, 100.0, 30.0, "ms", "Grain size"),
                PluginParameter("density", 0.5, 0.0, 1.0, 0.5, "", "Grain density"),
                PluginParameter("pitch", 0.5, -24.0, 24.0, 0.0, "st", "Pitch shift"),
                PluginParameter("variance", 0.3, 0.0, 1.0, 0.2, "", "Position variance"),
                PluginParameter("reverse_prob", 0.0, 0.0, 1.0, 0.0, "", "Reverse chance"),
                PluginParameter("scatter", 0.0, 0.0, 1.0, 0.0, "", "Scatter amount"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._buffer = np.zeros(int(sr))

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.effects.grain import GrainCloud
        cloud = GrainCloud(self.sr)
        cloud.set_source(samples)
        return cloud.process(len(samples) * 2)


@register_plugin
class VocoderFX(AudioPlugin):
    """Vocoder effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Vocoder",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Classic robot vocoder",
            parameters=[
                PluginParameter("bands", 8.0, 4.0, 32.0, 16.0, "", "Filter bands"),
                PluginParameter("frequency", 0.5, 100.0, 5000.0, 1000.0, "Hz", "Carrier freq"),
                PluginParameter("mod_index", 0.5, 0.0, 1.0, 0.5, "", "Modulation index"),
                PluginParameter("carrier_type", 0.0, 0.0, 3.0, 0.0, "", "0=sine 1=square 2=saw 3=noise"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.effects.modulation import Vocoder, RingModulator
        carrier_type = int(self.get_parameter("carrier_type"))
        freq = self.get_parameter("frequency")
        
        if carrier_type == 3:
            modulator = np.random.randn(len(samples))
        else:
            t = np.arange(len(samples), dtype=np.float64) / self.sr
            if carrier_type == 0:
                carrier = np.sin(2 * np.pi * freq * t)
            elif carrier_type == 1:
                carrier = np.sign(np.sin(2 * np.pi * freq * t))
            else:
                carrier = 2 * (t * freq % 1) - 1
            modulator = carrier

        vocoder = Vocoder(self.sr)
        return vocoder.process(samples, modulator)


@register_plugin
class SpectralEQ(AudioPlugin):
    """Spectral EQ processor."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Spectral EQ",
            version="1.0.0",
            category=PluginCategory.EQ,
            description="FFT-based spectral EQ",
            parameters=[
                PluginParameter("low_gain", 0.5, -18.0, 18.0, 0.0, "dB", "Low band gain"),
                PluginParameter("mid_gain", 0.5, -18.0, 18.0, 0.0, "dB", "Mid band gain"),
                PluginParameter("high_gain", 0.5, -18.0, 18.0, 0.0, "dB", "High band gain"),
                PluginParameter("low_freq", 0.15, 20.0, 500.0, 200.0, "Hz", "Low freq"),
                PluginParameter("high_freq", 0.7, 2000.0, 15000.0, 6000.0, "Hz", "High freq"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.effects.spectral import SpectralEQ
        eq = SpectralEQ(self.sr)
        
        low_gain = (self.get_parameter("low_gain") - 0.5) * 36
        mid_gain = (self.get_parameter("mid_gain") - 0.5) * 36
        high_gain = (self.get_parameter("high_gain") - 0.5) * 36
        low_freq = self.get_parameter("low_freq")
        high_freq = self.get_parameter("high_freq")
        
        eq.add_filter(low_freq, low_gain, q=1.0, filter_type="peak")
        eq.add_filter(1000.0, mid_gain, q=1.0, filter_type="peak")
        eq.add_filter(high_freq, high_gain, q=1.0, filter_type="peak")
        
        return eq.process(samples)


@register_plugin
class AutoPan(AudioPlugin):
    """Auto-panning with multiple LFOs."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Auto Pan",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Rhythmic auto-panning",
            parameters=[
                PluginParameter("rate", 0.3, 0.05, 10.0, 0.5, "Hz", "Pan rate"),
                PluginParameter("depth", 0.6, 0.0, 1.0, 0.6, "", "Pan depth"),
                PluginParameter("shape", 0.0, 0.0, 1.0, 0.0, "", "0=sine 1=square"),
                PluginParameter("phase_offset", 0.0, 0.0, 180.0, 0.0, "deg", "LFO phase"),
            ],
        )

    def process_stereo(self, left: np.ndarray, right: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        rate = self.get_parameter("rate")
        depth = self.get_parameter("depth")
        shape = self.get_parameter("shape")
        phase = np.radians(self.get_parameter("phase_offset"))

        n = len(left)
        t = np.arange(n, dtype=np.float64) / self.sr

        if shape < 0.3:
            lfo = np.sin(2 * np.pi * rate * t + phase)
        else:
            lfo = np.sign(np.sin(2 * np.pi * rate * t + phase))

        pan = lfo * depth * 0.5 + 0.5

        return left * (1 - pan), right * pan


@register_plugin
class Doubler(AudioPlugin):
    """Vocal doubler effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Doubler",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Wide vocal doubling",
            parameters=[
                PluginParameter("detune", 0.3, 0.0, 20.0, 5.0, "cents", "Detune amount"),
                PluginParameter("delay", 0.2, 0.0, 50.0, 15.0, "ms", "Delay time"),
                PluginParameter("spread", 0.5, 0.0, 1.0, 0.5, "", "Stereo spread"),
                PluginParameter("voices", 2.0, 1.0, 4.0, 2.0, "", "Number of voices"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        from calliope.voice.harmony import VocalDoubler
        doubler = VocalDoubler(self.sr)
        
        detune = self.get_parameter("detune")
        delay = self.get_parameter("delay")
        spread = self.get_parameter("spread")
        voices = int(self.get_parameter("voices"))
        
        result = samples.copy()
        
        for i in range(1, voices):
            cents = detune * (i / voices)
            semitones = cents / 100
            left, right = doubler.create_double(samples, detune_cents=cents, delay_ms=delay, spread=spread)
            result += (left + right) / 2
        
        return (result / voices).astype(np.float64)


@register_plugin
class BitcrushVerb(AudioPlugin):
    """Bitcrush + reverb combo."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Bitcrush Verb",
            version="1.0.0",
            category=PluginCategory.DISTORTION,
            description="Lo-fi crushed reverb",
            parameters=[
                PluginParameter("bits", 0.7, 2.0, 16.0, 8.0, "bits", "Bit depth"),
                PluginParameter("sample_rate", 0.5, 0.0, 1.0, 0.5, "", "Sample rate red."),
                PluginParameter("verb_mix", 0.4, 0.0, 1.0, 0.4, "", "Reverb mix"),
            ],
        )

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._hold = 0.0
        self._counter = 0

    def process(self, samples: np.ndarray) -> np.ndarray:
        bits = self.get_parameter("bits")
        sr_red = self.get_parameter("sample_rate")
        
        levels = 2.0 ** bits
        hold = self._hold
        counter = self._counter
        
        decimation = int(sr_red * 10) + 1
        
        output = np.zeros_like(samples)
        for i in range(len(samples)):
            if counter <= 0:
                hold = np.round(samples[i] * levels) / levels
                counter = decimation
            output[i] = hold
            counter -= 1
        
        self._hold = hold
        self._counter = counter
        
        from calliope.voice.reverb import schroeder_reverb_mono
        verb_wet = self.get_parameter("verb_mix")
        verb = schroeder_reverb_mono(output, self.sr, wet=verb_wet, t60=1.5)
        
        return ((1 - verb_wet) * output + verb_wet * verb).astype(np.float64)


@register_plugin
class TapeStop(AudioPlugin):
    """Tape stop/slowdown effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Tape Stop",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Tape slowdown effect",
            parameters=[
                PluginParameter("amount", 0.5, 0.0, 1.0, 0.5, "", "Slowdown amount"),
                PluginParameter("time", 0.5, 0.1, 2.0, 1.0, "s", "Effect time"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        amount = self.get_parameter("amount")
        time_s = self.get_parameter("time")
        
        n = len(samples)
        t = np.arange(n, dtype=np.float64) / self.sr
        
        slowdown = 1.0 - amount * (1.0 - 0.1) * (t / time_s)
        slowdown = np.maximum(slowdown, 0.1)
        
        output = np.zeros_like(samples)
        pos = 0.0
        for i in range(n):
            src_idx = int(pos)
            if src_idx < n:
                output[i] = samples[src_idx]
            pos += slowdown[i]
            if pos >= n:
                break
        
        return output.astype(np.float64)