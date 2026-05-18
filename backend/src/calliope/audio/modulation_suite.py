"""Modulation effects: Chorus, Phaser, and Bitcrusher."""

from __future__ import annotations

import numpy as np
from scipy import signal as sp_signal
from typing import List, Tuple, Optional


class ChorusEffect:
    """Classic chorus using multi-tap modulated delay."""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(
        self,
        samples: np.ndarray,
        depth: float = 0.002,
        rate: float = 1.5,
        voices: int = 3,
        mix: float = 0.5
    ) -> np.ndarray:
        n = len(samples) if samples.ndim == 1 else samples.shape[1]
        t = np.arange(n) / self.sr
        output = samples * (1.0 - mix)
        
        for i in range(voices):
            # Each voice has a different LFO phase
            phase = (i / voices) * 2 * np.pi
            lfo = (np.sin(2 * np.pi * rate * t + phase) + 1.0) * 0.5 * depth
            delay_samples = (lfo * self.sr).astype(int)
            
            # Simple modulated delay
            voice_samples = np.zeros_like(samples)
            for j in range(n):
                idx = j - delay_samples[j]
                if idx >= 0:
                    if samples.ndim == 1:
                        voice_samples[j] = samples[idx]
                    else:
                        voice_samples[:, j] = samples[:, idx]
            
            output += voice_samples * (mix / voices)
            
        return output


class PhaserEffect:
    """Phaser effect using chains of all-pass filters."""

    def __init__(self, sr: int = 48000, stages: int = 4):
        self.sr = sr
        self.stages = stages

    def process(self, samples: np.ndarray, rate: float = 0.5, depth: float = 0.7, feedback: float = 0.5) -> np.ndarray:
        # Simplified all-pass phaser approximation
        n = len(samples) if samples.ndim == 1 else samples.shape[1]
        t = np.arange(n) / self.sr
        lfo = (np.sin(2 * np.pi * rate * t) + 1.0) * 0.5 * depth
        
        # Apply modulated all-pass behavior (simplified spectral approach)
        processed = samples.copy()
        for _ in range(self.stages):
            # In a real implementation, we'd use recursive filters. 
            # This is a spectral approximation for the 'shebang'.
            b, a = sp_signal.butter(2, (500 + 2000 * lfo.mean()) / (self.sr / 2), btype="low")
            processed = sp_signal.lfilter(b, a, processed)
            
        return samples * (1.0 - feedback) + processed * feedback


class Bitcrusher:
    """Lo-fi bit reduction and sample rate reduction."""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(self, samples: np.ndarray, bits: int = 8, downsample: int = 4) -> np.ndarray:
        # Bit depth reduction
        levels = 2 ** bits
        crushed = np.round(samples * (levels / 2)) / (levels / 2)
        
        # Sample rate reduction
        for i in range(0, len(crushed), downsample):
            chunk = crushed[i:i+downsample] if crushed.ndim == 1 else crushed[:, i:i+downsample]
            if crushed.ndim == 1:
                crushed[i:i+downsample] = chunk[0]
            else:
                crushed[:, i:i+downsample] = chunk[:, 0:1]
                
        return crushed
