"""Granular synthesis engine for textures and pads."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Optional


@dataclass
class GrainParams:
    position: float = 0.5  # 0.0 to 1.0 in the buffer
    duration: float = 0.1  # seconds
    pitch: float = 1.0     # playback rate
    density: float = 20.0  # grains per second
    jitter: float = 0.01   # position randomization
    pitch_jitter: float = 0.01
    stereo_spread: float = 0.5


class GranularEngine:
    """Engine that generates audio by overlapping small grains from a buffer."""

    def __init__(self, buffer: np.ndarray, sr: int = 48000):
        self.buffer = buffer
        self.sr = sr
        self.buffer_duration = len(buffer) / sr

    def generate(self, duration_sec: float, params: GrainParams) -> np.ndarray:
        n_samples = int(duration_sec * self.sr)
        output = np.zeros((2, n_samples))  # Stereo output
        
        grain_samples = int(params.duration * self.sr)
        if grain_samples < 2:
            return np.zeros((2, n_samples))
            
        # Hann window for smooth grains
        window = np.hanning(grain_samples)
        
        # Determine number of grains to spawn
        n_grains = int(duration_sec * params.density)
        
        for _ in range(n_grains):
            # Randomized position and pitch
            pos_offset = (np.random.rand() - 0.5) * params.jitter
            start_pos = int((params.position + pos_offset) * self.sr * self.buffer_duration)
            
            pitch_offset = (np.random.rand() - 0.5) * params.pitch_jitter
            pitch = params.pitch + pitch_offset
            
            # Start time within the output duration
            start_time = np.random.rand() * (duration_sec - params.duration)
            start_sample = int(start_time * self.sr)
            
            # Extract and process grain
            # Simple resampling for pitch shift
            indices = (np.arange(grain_samples) * pitch).astype(int)
            valid_indices = (start_pos + indices) < len(self.buffer)
            
            grain = np.zeros(grain_samples)
            actual_indices = indices[valid_indices]
            grain[valid_indices] = self.buffer[start_pos + actual_indices]
            grain *= window
            
            # Panning
            pan = (np.random.rand() - 0.5) * params.stereo_spread + 0.5
            left_gain = np.sqrt(1.0 - pan)
            right_gain = np.sqrt(pan)
            
            # Add to output
            end_sample = min(start_sample + grain_samples, n_samples)
            grain_len = end_sample - start_sample
            if grain_len > 0:
                output[0, start_sample:end_sample] += grain[:grain_len] * left_gain
                output[1, start_sample:end_sample] += grain[:grain_len] * right_gain
                
        # Simple normalization to avoid clipping
        peak = np.max(np.abs(output))
        if peak > 1.0:
            output /= peak
            
        return output
