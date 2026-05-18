"""Physical modeling synthesis and advanced sampling."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional


class KarplusStrongSynth:
    """String synthesis using physical modeling (delay line with feedback filter)."""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def generate(self, duration_sec: float, frequency: float, decay: float = 0.98) -> np.ndarray:
        n_samples = int(duration_sec * self.sr)
        delay_len = int(self.sr / frequency)
        
        # Initial excitation (white noise)
        ring_buffer = np.random.uniform(-1, 1, delay_len)
        output = np.zeros(n_samples)
        
        for i in range(n_samples):
            # Karplus-Strong algorithm: simple averaging filter
            val = ring_buffer[i % delay_len]
            output[i] = val
            
            # Update buffer with filtered feedback
            next_idx = (i + 1) % delay_len
            avg = 0.5 * (val + ring_buffer[next_idx])
            ring_buffer[i % delay_len] = avg * decay
            
        return output


@dataclass
class SamplerZone:
    sample: np.ndarray
    root_midi: int
    low_midi: int
    high_midi: int


class MultiSampler:
    """Multi-sample engine with key-zoning and pitch shifting."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.zones: List[SamplerZone] = []

    def add_zone(self, sample: np.ndarray, root: int, low: int, high: int):
        self.zones.append(SamplerZone(sample, root, low, high))

    def generate_note(self, midi_note: int, duration_sec: float) -> np.ndarray:
        # Find appropriate zone
        zone = next((z for z in self.zones if z.low_midi <= midi_note <= z.high_midi), None)
        if not zone:
            return np.zeros(int(duration_sec * self.sr))
            
        # Calculate pitch shift ratio
        ratio = 2 ** ((midi_note - zone.root_midi) / 12)
        
        # Simple linear interpolation resampling
        n_samples = int(duration_sec * self.sr)
        indices = (np.arange(n_samples) * ratio).astype(int)
        valid_indices = indices < len(zone.sample)
        
        output = np.zeros(n_samples)
        output[valid_indices] = zone.sample[indices[valid_indices]]
        
        # Apply release fade
        fade_len = int(0.1 * self.sr)
        if fade_len < n_samples:
            fade = np.linspace(1.0, 0.0, fade_len)
            output[-fade_len:] *= fade
            
        return output
