"""Spatial audio effects: Convolution Reverb and Multi-mode Delay."""

from __future__ import annotations

import numpy as np
from scipy import signal as sp_signal
from typing import Literal, Optional


class ConvolutionReverb:
    """High-quality reverb using FFT convolution."""

    def __init__(self, impulse_response: np.ndarray, sr: int = 48000):
        self.ir = impulse_response
        self.sr = sr
        # Normalize IR
        self.ir = self.ir / (np.max(np.abs(self.ir)) + 1e-10)

    @classmethod
    def create_algorithmic_ir(cls, duration: float, decay: float, sr: int = 48000) -> ConvolutionReverb:
        """Create a synthetic impulse response (exponentially decaying noise)."""
        n = int(duration * sr)
        t = np.arange(n) / sr
        noise = np.random.randn(n)
        env = np.exp(-t * (10 / decay))
        ir = noise * env
        return cls(ir, sr)

    def process(self, samples: np.ndarray, wet_dry: float = 0.3) -> np.ndarray:
        if samples.ndim == 2:
            # Process stereo
            left = sp_signal.fftconvolve(samples[0], self.ir, mode="full")[:len(samples[0])]
            right = sp_signal.fftconvolve(samples[1], self.ir, mode="full")[:len(samples[1])]
            wet = np.stack([left, right])
        else:
            wet = sp_signal.fftconvolve(samples, self.ir, mode="full")[:len(samples)]
            
        return samples * (1.0 - wet_dry) + wet * wet_dry


class MultiModeDelay:
    """Delay effect with multiple modes: Mono, Stereo, Ping-pong."""

    def __init__(
        self,
        delay_time: float = 0.5,
        feedback: float = 0.4,
        mode: Literal["mono", "stereo", "ping-pong"] = "mono",
        sr: int = 48000
    ):
        self.delay_time = delay_time
        self.feedback = feedback
        self.mode = mode
        self.sr = sr

    def process(self, samples: np.ndarray, wet_dry: float = 0.3) -> np.ndarray:
        n = len(samples) if samples.ndim == 1 else samples.shape[1]
        delay_samples = int(self.delay_time * self.sr)
        
        if samples.ndim == 1:
            output = samples.copy()
            buffer = np.zeros(n + delay_samples)
            for i in range(n):
                val = samples[i] + buffer[i] * self.feedback
                buffer[i + delay_samples] = val
                output[i] = samples[i] * (1.0 - wet_dry) + buffer[i] * wet_dry
            return output
        else:
            # Stereo/Ping-pong processing
            left_out = samples[0].copy()
            right_out = samples[1].copy()
            left_buf = np.zeros(n + delay_samples)
            right_buf = np.zeros(n + delay_samples)
            
            for i in range(n):
                if self.mode == "ping-pong":
                    # Swap feedback channels
                    l_val = samples[0, i] + right_buf[i] * self.feedback
                    r_val = samples[1, i] + left_buf[i] * self.feedback
                    left_buf[i + delay_samples] = l_val
                    right_buf[i + delay_samples] = r_val
                else:
                    l_val = samples[0, i] + left_buf[i] * self.feedback
                    r_val = samples[1, i] + right_buf[i] * self.feedback
                    left_buf[i + delay_samples] = l_val
                    right_buf[i + delay_samples] = r_val
                    
                left_out[i] = samples[0, i] * (1.0 - wet_dry) + left_buf[i] * wet_dry
                right_out[i] = samples[1, i] * (1.0 - wet_dry) + right_buf[i] * wet_dry
                
            return np.stack([left_out, right_out])
