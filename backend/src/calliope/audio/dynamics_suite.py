"""Advanced dynamics processing: Multiband Compressor and Transient Shaper."""

from __future__ import annotations

import numpy as np
from scipy import signal as sp_signal
from typing import List, Tuple, Optional


class MultibandCompressor:
    """Compressor that operates on multiple frequency bands."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.crossover_freqs = [200, 3000] # Low-Mid and Mid-High crossovers
        
    def _split_bands(self, samples: np.ndarray) -> List[np.ndarray]:
        nyq = self.sr / 2
        bands = []
        
        # Low band
        b, a = sp_signal.butter(4, self.crossover_freqs[0] / nyq, btype="low")
        bands.append(sp_signal.lfilter(b, a, samples))
        
        # Mid band
        b, a = sp_signal.butter(4, [self.crossover_freqs[0] / nyq, self.crossover_freqs[1] / nyq], btype="band")
        bands.append(sp_signal.lfilter(b, a, samples))
        
        # High band
        b, a = sp_signal.butter(4, self.crossover_freqs[1] / nyq, btype="high")
        bands.append(sp_signal.lfilter(b, a, samples))
        
        return bands

    def process(
        self,
        samples: np.ndarray,
        thresholds: List[float] = [-20.0, -24.0, -30.0],
        ratios: List[float] = [4.0, 3.0, 2.0],
    ) -> np.ndarray:
        bands = self._split_bands(samples)
        compressed_bands = []
        
        from calliope.audio.ai_mix import AIMixEngine
        engine = AIMixEngine(self.sr)
        
        for i, band in enumerate(bands):
            # Apply compression to each band independently
            # Reusing the existing compression logic from AIMixEngine
            compressed = engine.auto_compression(band, amount=0.5) # Simplified for now
            compressed_bands.append(compressed)
            
        return np.sum(compressed_bands, axis=0)


class TransientShaper:
    """Adjusts attack and sustain of audio signals."""

    def __init__(self, attack: float = 0.0, sustain: float = 0.0, sr: int = 48000):
        self.attack = attack # -1.0 to 1.0
        self.sustain = sustain # -1.0 to 1.0
        self.sr = sr

    def process(self, samples: np.ndarray) -> np.ndarray:
        # Simple envelope follower based shaper
        envelope = np.abs(samples)
        # Fast attack, slow release for detection
        attack_alpha = 0.999
        release_alpha = 0.99
        
        detect_env = np.zeros_like(envelope)
        curr = 0.0
        for i in range(len(envelope)):
            if envelope[i] > curr:
                curr = attack_alpha * curr + (1 - attack_alpha) * envelope[i]
            else:
                curr = release_alpha * curr + (1 - release_alpha) * envelope[i]
            detect_env[i] = curr
            
        # Derivative of envelope for transient detection
        transients = np.diff(detect_env, prepend=0)
        transients = np.maximum(0, transients)
        
        # Apply shaping
        shaping = 1.0 + (transients * self.attack * 5.0) + (detect_env * self.sustain * 0.5)
        return samples * shaping
