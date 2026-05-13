"""Automatic harmony generation and vocal doubling effects."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy import signal


class HarmonyType(str, Enum):
    UNISON = "unison"
    THIRDS_UP = "thirds_up"
    THIRDS_DOWN = "thirds_down"
    FIFTHS_UP = "fifths_up"
    OCTAVES_UP = "octaves_up"
    OCTAVES_DOWN = "octaves_down"
    CLOSE_HARMONY = "close_harmony"
    OPEN_HARMONY = "open_harmony"


@dataclass
class HarmonyConfig:
    harmony_type: HarmonyType = HarmonyType.THIRDS_UP
    num_voices: int = 1
    detune_cents: float = 5.0
    pan_width: float = 0.5
    level_db: float = -3.0
    spread_ms: float = 10.0
    formant_mode: Literal["preserve", "shift", "blend"] = "preserve"
    eq_low_db: float = 0.0
    eq_high_db: float = 0.0


class HarmonyGenerator:
    """
    Generate automatic vocal harmonies from a lead vocal.
    Supports various harmony types, detuning, and stereo spread.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = HarmonyConfig()
        self._pitch_tracker = None

    def generate(self, y: np.ndarray) -> list[np.ndarray]:
        """Generate harmony voices from lead vocal."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        from calliope.pitch.yin import yin_track_series
        f0_contour = yin_track_series(y, self.sr, frame=2048, hop=512, fmin=70.0, fmax=900.0)
        
        harmonies = []
        for voice_idx in range(self.config.num_voices):
            harmony = self._generate_voice_harmony(
                y, f0_contour, voice_idx
            )
            harmonies.append(harmony)
        
        return harmonies

    def _generate_voice_harmony(
        self,
        y: np.ndarray,
        f0_contour: np.ndarray,
        voice_idx: int,
    ) -> np.ndarray:
        """Generate a single harmony voice."""
        
        intervals = self._get_intervals(voice_idx)
        
        if intervals == 0:
            return y.copy()
        
        shift_semitones = intervals * 12.0 + (voice_idx * self.config.detune_cents / 100.0)
        
        from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
        
        shifted = pitch_shift_phase_vocoder(
            y, self.sr, semitones=shift_semitones,
            n_fft=4096, hop_length=512
        )
        
        if self.config.formant_mode == "preserve":
            shift_factor = 2.0 ** (shift_semitones / 12.0)
            formant_shift = 1.0 + (shift_factor - 1.0) * 0.5
            from calliope.voice.formant_shift import formant_shift_stft
            shifted = formant_shift_stft(shifted, self.sr, shift=formant_shift, n_fft=2048, hop=512)
        
        if abs(self.config.level_db) > 0.1:
            gain = 10 ** (self.config.level_db / 20.0)
            shifted = shifted * gain
        
        return shifted.astype(np.float64)

    def _get_intervals(self, voice_idx: int) -> int:
        """Get interval in semitones for voice."""
        config = self.config
        
        if config.harmony_type == HarmonyType.UNISON:
            return 0
        
        intervals_map = {
            HarmonyType.THIRDS_UP: [4, 3],
            HarmonyType.THIRDS_DOWN: [-3, -4],
            HarmonyType.FIFTHS_UP: [7, 7],
            HarmonyType.OCTAVES_UP: [12, 12],
            HarmonyType.OCTAVES_DOWN: [-12, -12],
            HarmonyType.CLOSE_HARMONY: [3, 7, 12],
            HarmonyType.OPEN_HARMONY: [4, 7, 10, 12],
        }
        
        intervals = intervals_map.get(config.harmony_type, [4])
        
        if voice_idx < len(intervals):
            return intervals[voice_idx % len(intervals)]
        
        return intervals[voice_idx % len(intervals)]

    def stack_voices(self, lead: np.ndarray, harmonies: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
        """Mix lead vocal with harmonies into stereo."""
        lead = np.asarray(lead, dtype=np.float64).ravel()
        
        mix = lead.copy()
        pan_positions = self._calculate_pans(len(harmonies))
        
        left_mix = np.zeros(len(lead))
        right_mix = np.zeros(len(lead))
        
        left_mix += lead * (1.0 - self.config.pan_width / 2)
        right_mix += lead * (1.0 - self.config.pan_width / 2)
        
        for i, harmony in enumerate(harmonies):
            harmony = np.asarray(harmony, dtype=np.float64).ravel()
            if len(harmony) < len(lead):
                harmony = np.pad(harmony, (0, len(lead) - len(harmony)))
            
            left_gain = pan_positions[i] * (1.0 - self.config.pan_width / 2)
            right_gain = (1.0 - pan_positions[i]) * (1.0 - self.config.pan_width / 2)
            
            left_mix += harmony * left_gain
            right_mix += harmony * right_gain
        
        return left_mix.astype(np.float64), right_mix.astype(np.float64)

    def _calculate_pans(self, num_harmonies: int) -> list[float]:
        """Calculate pan positions for harmonies."""
        if num_harmonies == 0:
            return []
        elif num_harmonies == 1:
            return [0.5]
        elif num_harmonies == 2:
            return [0.25, 0.75]
        elif num_harmonies == 3:
            return [0.2, 0.5, 0.8]
        else:
            return [i / (num_harmonies + 1) for i in range(1, num_harmonies + 1)]


class VocalDoubler:
    """
    Create natural-sounding vocal doubles.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def create_double(
        self,
        y: np.ndarray,
        detune_cents: float = 5.0,
        delay_ms: float = 15.0,
        spread: float = 0.5,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Create a doubled vocal track."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        shift_up = detune_cents / 100.0 / 12.0 * 1200.0
        shift_down = -detune_cents / 100.0 / 12.0 * 1200.0
        
        from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
        
        doubled_up = pitch_shift_phase_vocoder(
            y, self.sr, semitones=shift_up / 100.0 * 100,
            n_fft=4096, hop_length=512
        )
        doubled_down = pitch_shift_phase_vocoder(
            y, self.sr, semitones=shift_down / 100.0 * 100,
            n_fft=4096, hop_length=512
        )
        
        delay_samples = int(delay_ms * self.sr / 1000.0)
        if delay_samples > 0:
            doubled_up = np.concatenate([np.zeros(delay_samples), doubled_up[:-delay_samples]])
            doubled_down = np.concatenate([np.zeros(max(0, -delay_samples)), doubled_down[:len(doubled_down) - abs(delay_samples)]])
        
        if len(doubled_up) < len(y):
            doubled_up = np.pad(doubled_up, (0, len(y) - len(doubled_up)))
            doubled_down = np.pad(doubled_down, (0, len(y) - len(doubled_down)))
        elif len(doubled_up) > len(y):
            doubled_up = doubled_up[:len(y)]
            doubled_down = doubled_down[:len(y)]
        
        left = (y + doubled_up * (1.0 - spread / 2) + doubled_down * spread / 2) / 2
        right = (y + doubled_down * (1.0 - spread / 2) + doubled_up * spread / 2) / 2
        
        return left.astype(np.float64), right.astype(np.float64)

    def chorus_doubler(self, y: np.ndarray, num_voices: int = 3) -> np.ndarray:
        """Create chorus doubling effect with multiple detuned voices."""
        from calliope.plugins.modulation import Chorus
        
        chorus = Chorus(self.sr)
        chorus.set_parameter("rate", 0.3)
        chorus.set_parameter("depth", 0.4)
        chorus.set_parameter("delay", 10.0)
        chorus.set_parameter("mix", 0.5)
        
        voices = [y]
        
        for i in range(num_voices):
            shifted = pitch_shift_simple(y, self.sr, (i - num_voices // 2) * 3.0)
            voices.append(shifted)
        
        return np.mean(voices, axis=0).astype(np.float64)


def pitch_shift_simple(y: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    """Simple pitch shift without formant preservation."""
    ratio = 2.0 ** (semitones / 12.0)
    
    from scipy import signal as sp_signal
    num_samples = int(len(y) / ratio)
    return sp_signal.resample(y, num_samples)


def vocode_vocal(
    vocal: np.ndarray,
    synth: np.ndarray,
    sr: int,
    num_bands: int = 16,
) -> np.ndarray:
    """
    Vocode vocal with synthesizer for robotic effects.
    """
    from calliope.tune.psola import vocode
    return vocode(synth, vocal, sr, num_bands, excitation_mode="mixed")


def telephone_effect(y: np.ndarray, sr: int) -> np.ndarray:
    """Apply telephone bandwidth effect (300Hz - 3400Hz)."""
    sos = signal.butter(4, [300, 3400], btype='band', output='sos', fs=sr)
    return signal.sosfilt(sos, y).astype(np.float64)


def radio_effect(y: np.ndarray, sr: int) -> np.ndarray:
    """Apply vintage radio effect."""
    sos_am = signal.butter(2, 5000, btype='low', output='sos', fs=sr)
    filtered = signal.sosfilt(sos_am, y)
    
    noise = np.random.randn(len(y)) * 0.02
    sos_hp = signal.butter(2, 100, btype='high', output='sos', fs=sr)
    noise = signal.sosfilt(sos_hp, noise)
    
    return (filtered + noise).astype(np.float64)