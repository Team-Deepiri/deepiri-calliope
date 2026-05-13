"""Pitch and vocal effect plugins."""

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
class PitchShifter(AudioPlugin):
    """High-quality pitch shifting."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Pitch Shifter",
            version="1.0.0",
            category=PluginCategory.PITCH,
            description="Professional pitch shifting",
            parameters=[
                PluginParameter("semitones", 0.0, -24.0, 24.0, 0.0, "st", "Pitch shift"),
                PluginParameter("formant_preserve", 0.8, 0.0, 1.0, 0.8, "", "Formant preserve"),
                PluginParameter("wet", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        semitones = float(self.get_parameter("semitones"))
        formant = float(self.get_parameter("formant_preserve"))
        wet = float(self.get_parameter("wet"))

        if abs(semitones) < 0.1:
            return samples

        from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
        shifted = pitch_shift_phase_vocoder(samples, self.sr, semitones, n_fft=4096, hop_length=512)

        if formant > 0 and abs(semitones) > 0.5:
            shift_factor = 2.0 ** (semitones / 12.0)
            formant_shift = 1.0 + (shift_factor - 1.0) * (1.0 - formant)
            from calliope.voice.formant_shift import formant_shift_stft
            shifted = formant_shift_stft(shifted, self.sr, shift=formant_shift, n_fft=2048, hop=512)

        return ((1 - wet) * samples + wet * shifted).astype(np.float64)


@register_plugin
class FormantShift(AudioPlugin):
    """Formant frequency shifting."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Formant Shift",
            version="1.0.0",
            category=PluginCategory.PITCH,
            description="Formant manipulation without pitch change",
            parameters=[
                PluginParameter("shift", 0.5, 0.5, 2.0, 1.0, "", "Formant shift (1=neutral)"),
                PluginParameter("wet", 1.0, 0.0, 1.0, 1.0, "", "Dry/wet"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        shift = float(self.get_parameter("shift"))
        wet = float(self.get_parameter("wet"))

        from calliope.voice.formant_shift import formant_shift_stft
        processed = formant_shift_stft(samples, self.sr, shift=shift, n_fft=2048, hop=512)

        return ((1 - wet) * samples + wet * processed).astype(np.float64)


@register_plugin
class VocalTuner(AudioPlugin):
    """Real-time vocal pitch correction."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Vocal Tuner",
            version="1.0.0",
            category=PluginCategory.PITCH,
            description="Real-time pitch correction",
            parameters=[
                PluginParameter("scale", 0.0, 0.0, 11.0, 0.0, "", "Scale (0=major, etc)"),
                PluginParameter("root", 0.5, 0.0, 11.0, 0.0, "", "Root note"),
                PluginParameter("strength", 0.8, 0.0, 1.0, 0.8, "", "Correction strength"),
                PluginParameter("speed", 0.5, 0.0, 1.0, 0.5, "", "Correction speed"),
                PluginParameter("vibrato", 0.0, 0.0, 1.0, 0.0, "", "Natural vibrato"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        strength = float(self.get_parameter("strength"))
        speed = float(self.get_parameter("speed"))
        vibrato = float(self.get_parameter("vibrato"))

        if strength < 0.01:
            return samples

        from calliope.pitch.yin import yin_track_series
        from calliope.tune.autotune_simple import retune_contour_linear
        from calliope.tune.warp_autotune import warp_pitch_map

        f0 = yin_track_series(samples, self.sr, frame=2048, hop=512, fmin=70.0, fmax=900.0)
        target, _ = retune_contour_linear(f0, scale_midi=None, smooth=0.2, pull=0.9)

        corrected = warp_pitch_map(
            samples, self.sr, f0, target,
            hop=512, frame=2048,
            strength=strength * speed,
            smooth_bins=8
        )

        return corrected.astype(np.float64)


@register_plugin
class Octaver(AudioPlugin):
    """Guitar-style octave effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Octaver",
            version="1.0.0",
            category=PluginCategory.PITCH,
            description="Octave down/up effect",
            parameters=[
                PluginParameter("octave_down", 0.0, 0.0, 1.0, 0.0, "", "Octave down"),
                PluginParameter("octave_up", 0.0, 0.0, 1.0, 0.0, "", "2 octaves down"),
                PluginParameter("sub_up", 0.0, 0.0, 1.0, 0.0, "", "Sub octave up"),
                PluginParameter("dry", 1.0, 0.0, 1.0, 1.0, "", "Dry level"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        oct_down = float(self.get_parameter("octave_down"))
        oct_down2 = float(self.get_parameter("octave_up"))
        sub_up = float(self.get_parameter("sub_up"))
        dry = float(self.get_parameter("dry"))

        result = samples * dry

        if oct_down > 0.01:
            from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
            oct1 = pitch_shift_phase_vocoder(samples, self.sr, -12, n_fft=4096, hop_length=512)
            result = result + oct1 * oct_down

        if oct_down2 > 0.01:
            oct2 = pitch_shift_phase_vocoder(samples, self.sr, -24, n_fft=4096, hop_length=512)
            result = result + oct2 * oct_down2

        if sub_up > 0.01:
            t = np.arange(len(samples), dtype=np.float64) / self.sr
            sub = np.sin(2 * np.pi * 20 * t)
            env = np.abs(samples)
            sos = signal.butter(2, 10, btype='low', output='sos', fs=self.sr)
            env = signal.sosfilt(sos, env)
            result = result + sub * env * sub_up

        return np.clip(result, -1.5, 1.5).astype(np.float64)


@register_plugin
class Robotizer(AudioPlugin):
    """Vocoder-based robot effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Robotizer",
            version="1.0.0",
            category=PluginCategory.MODULATION,
            description="Vocoder robot voice",
            parameters=[
                PluginParameter("formants", 0.5, 0.5, 2.0, 1.0, "", "Formant shift"),
                PluginParameter("pitch", 0.5, 0.5, 2.0, 1.0, "", "Pitch shift"),
                PluginParameter("vibrato", 0.0, 0.0, 1.0, 0.0, "", "Robot vibrato"),
                PluginParameter("noise", 0.0, 0.0, 0.3, 0.0, "", "Breath noise"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        formants = float(self.get_parameter("formants"))
        pitch = float(self.get_parameter("pitch"))
        vibrato = float(self.get_parameter("vibrato"))
        noise = float(self.get_parameter("noise"))

        if pitch != 1.0:
            semitones = 12.0 * np.log2(pitch)
            from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
            samples = pitch_shift_phase_vocoder(samples, self.sr, semitones, n_fft=4096, hop_length=512)

        if formants != 1.0:
            from calliope.voice.formant_shift import formant_shift_stft
            samples = formant_shift_stft(samples, self.sr, shift=formants, n_fft=2048, hop=512)

        if vibrato > 0:
            t = np.arange(len(samples), dtype=np.float64) / self.sr
            mod = np.sin(2 * np.pi * 6 * t) * vibrato * 50
            delay = np.round(mod).astype(int)
            for i in range(len(samples)):
                idx = max(0, min(i + delay[i], len(samples) - 1))
                samples[i] = samples[idx]

        if noise > 0:
            breath = np.random.randn(len(samples)) * noise * 0.1
            sos_hp = signal.butter(2, 2000, btype='high', output='sos', fs=self.sr)
            breath = signal.sosfilt(sos_hp, breath)
            samples = samples + breath

        return samples.astype(np.float64)


@register_plugin
class TelephoneEffect(AudioPlugin):
    """Telephone bandwidth effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Telephone Effect",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Telephone bandwidth simulation",
            parameters=[
                PluginParameter("mode", 0.5, 0.0, 1.0, 0.0, "", "0=landline, 1=cellular"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        mode = float(self.get_parameter("mode"))

        if mode < 0.5:
            sos = signal.butter(4, [300, 3400], btype='band', output='sos', fs=self.sr)
        else:
            sos = signal.butter(4, [300, 3000], btype='band', output='sos', fs=self.sr)

        filtered = signal.sosfilt(sos, samples)

        return filtered.astype(np.float64)


@register_plugin
class RadioEffect(AudioPlugin):
    """Vintage radio effect."""

    def _create_info(self) -> PluginInfo:
        return PluginInfo(
            name="Radio Effect",
            version="1.0.0",
            category=PluginCategory.FILTER,
            description="Vintage radio simulation",
            parameters=[
                PluginParameter("age", 0.5, 0.0, 1.0, 0.3, "", "0=modern, 1=vintage"),
                PluginParameter("distortion", 0.3, 0.0, 1.0, 0.2, "", "Distortion amount"),
                PluginParameter("static", 0.2, 0.0, 0.5, 0.1, "", "Static noise"),
            ],
        )

    def process(self, samples: np.ndarray) -> np.ndarray:
        age = float(self.get_parameter("age"))
        distortion = float(self.get_parameter("distortion"))
        static = float(self.get_parameter("static"))

        sos_am = signal.butter(2, 5000 * (1 - age * 0.5), btype='low', output='sos', fs=self.sr)
        filtered = signal.sosfilt(sos_am, samples)

        if distortion > 0:
            driven = np.tanh(filtered * (1 + distortion * 5))
            filtered = filtered * (1 - distortion) + driven * distortion

        if static > 0:
            noise = np.random.randn(len(samples)) * static * 0.05
            sos_hp = signal.butter(2, 500, btype='high', output='sos', fs=self.sr)
            noise = signal.sosfilt(sos_hp, noise)
            filtered = filtered + noise

        return filtered.astype(np.float64)