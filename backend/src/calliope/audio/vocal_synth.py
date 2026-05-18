"""AI Singing Voice Synthesis (SVS) engine."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

from calliope.audio.synthesizer import Oscillator, OscillatorConfig, Envelope, EnvelopeConfig
from calliope.tune.psola import compute_formant_features


@dataclass
class VocalVoiceConfig:
    name: str
    gender: str = "neutral"
    brightness: float = 0.5
    vibrato_rate: float = 5.5
    vibrato_depth: float = 0.2


class AIVocalSynthesizer:
    """Neural-inspired singing voice synthesizer."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.voices = {
            "soprano": VocalVoiceConfig("Soprano", "female", 0.7, 6.0, 0.3),
            "tenor": VocalVoiceConfig("Tenor", "male", 0.5, 5.0, 0.2),
            "alt": VocalVoiceConfig("Alt", "female", 0.4, 5.5, 0.2),
        }

    def synthesize(
        self,
        lyrics: str,
        melody: List[Tuple[int, float, float]],  # (midi, start, duration)
        voice_name: str = "soprano"
    ) -> np.ndarray:
        """
        Generates singing audio from lyrics and melody.
        """
        voice = self.voices.get(voice_name, self.voices["soprano"])
        total_duration = max(m[1] + m[2] for m in melody) + 1.0
        output = np.zeros(int(total_duration * self.sr))
        
        # Phoneme simulation: mapping common vowels to formant frequencies
        # (F1, F2, F3)
        vowel_formants = {
            "a": (800, 1200, 2500),
            "e": (400, 2200, 3000),
            "i": (300, 2500, 3500),
            "o": (500, 800, 2400),
            "u": (300, 700, 2300),
        }
        
        words = lyrics.split()
        
        for i, (midi, start, duration) in enumerate(melody):
            word = words[i % len(words)].lower()
            vowel = next((c for c in word if c in vowel_formants), "a")
            formants = vowel_formants[vowel]
            
            # 1. Source: Band-limited pulse with vibrato
            freq = 440.0 * 2.0 ** ((midi - 69.0) / 12.0)
            n_samples = int(duration * self.sr)
            t = np.arange(n_samples) / self.sr
            
            # Vibrato LFO
            vibrato = np.sin(2 * np.pi * voice.vibrato_rate * t) * voice.vibrato_depth
            vibrato_freq = freq * (2.0 ** (vibrato / 12.0))
            
            # Pulse source (sawtooth for rich harmonics)
            phase = 2 * np.pi * np.cumsum(vibrato_freq) / self.sr
            source = (signal_sawtooth(phase) + 0.5 * np.random.randn(n_samples) * 0.05)
            
            # 2. Filter: Formant filtering (Vocal Tract simulation)
            filtered = self._apply_vocal_tract(source, formants)
            
            # 3. Envelope
            env = Envelope(EnvelopeConfig(attack=0.1, decay=0.1, sustain=0.8, release=0.2), self.sr)
            envelope = env.generate(n_samples, n_samples)
            
            start_sample = int(start * self.sr)
            end_sample = start_sample + n_samples
            
            if end_sample <= len(output):
                output[start_sample:end_sample] += filtered * envelope[:n_samples]
                
        # Final AI-Mastering for vocals
        from calliope.audio.ai_mix import auto_mix
        output = auto_mix(output, self.sr, target_lufs=-18.0, brightness=0.8, warmth=0.4)
        
        return output

    def _apply_vocal_tract(self, source: np.ndarray, formants: Tuple[float, float, float]) -> np.ndarray:
        """Applies resonant filters to simulate vocal formants."""
        from scipy.signal import butter, lfilter
        
        nyq = self.sr / 2
        filtered = source.copy()
        
        for f in formants:
            # Each formant is a bandpass filter with high resonance
            f_norm = np.clip(f / nyq, 0.01, 0.99)
            b, a = butter(2, [f_norm * 0.9, f_norm * 1.1], btype='bandpass')
            filtered += lfilter(b, a, source) * 2.0
            
        return filtered / 4.0


def signal_sawtooth(phase: np.ndarray) -> np.ndarray:
    return 2 * (phase / (2 * np.pi) % 1) - 1
