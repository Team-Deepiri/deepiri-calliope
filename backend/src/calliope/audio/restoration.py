"""Noise reduction, de-hum, and audio restoration."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal


@dataclass
class NoiseReductionConfig:
    threshold_db: float = -40.0
    reduction_db: float = 20.0
    smoothing_ms: float = 5.0
    transition_ms: float = 2.0


class NoiseGate:
    """Expander-based noise gate."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = NoiseReductionConfig()
        self._envelope = 0.0

    def process(self, y: np.ndarray) -> np.ndarray:
        y = np.asarray(y, dtype=np.float64).ravel()
        threshold = 10 ** (self.config.threshold_db / 20.0)
        
        envelope = np.abs(y)
        
        attack_coef = np.exp(-1.0 / (self.config.transition_ms * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (self.config.smoothing_ms * self.sr / 1000.0))
        
        output = np.zeros_like(y)
        env = self._envelope
        
        for i in range(len(y)):
            abs_s = abs(y[i])
            if abs_s > env:
                env = attack_coef * env + (1.0 - attack_coef) * abs_s
            else:
                env = release_coef * env + (1.0 - release_coef) * abs_s
            
            if env > threshold:
                gain = min(1.0, env / (threshold + 1e-10))
                output[i] = y[i] * gain
            else:
                reduction = 10 ** (-self.config.reduction_db / 20.0)
                output[i] = y[i] * reduction
        
        self._envelope = env
        return output.astype(np.float64)

    def reset(self) -> None:
        self._envelope = 0.0


class SpectralSubtraction:
    """
    Spectral subtraction for noise reduction.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._noise_profile: np.ndarray | None = None
        self._noise_frames = 0

    def learn_noise(self, noise_samples: np.ndarray) -> None:
        """Learn noise profile from noise-only section."""
        noise = np.asarray(noise_samples, dtype=np.float64).ravel()
        
        n_fft = 2048
        hop = 512
        
        window = np.hanning(n_fft)
        noise_specs = []
        
        for i in range(0, len(noise) - n_fft, hop):
            frame = noise[i:i + n_fft] * window
            spec = np.abs(np.fft.rfft(frame, n=n_fft)) ** 2
            noise_specs.append(spec)
        
        if noise_specs:
            self._noise_profile = np.mean(noise_specs, axis=0)
            self._noise_frames = len(noise_specs)

    def process(self, y: np.ndarray, reduction_db: float = 18.0) -> np.ndarray:
        """Apply spectral subtraction."""
        if self._noise_profile is None:
            return np.asarray(y, dtype=np.float64).ravel()
        
        y = np.asarray(y, dtype=np.float64).ravel()
        n_fft = 2048
        hop = 512
        
        reduction_factor = 10 ** (-reduction_db / 10.0)
        
        window = np.hanning(n_fft)
        output = np.zeros_like(y)
        window_sum = np.zeros_like(y)
        
        for i in range(0, len(y) - n_fft, hop):
            frame = y[i:i + n_fft] * window
            
            spec = np.fft.rfft(frame, n=n_fft)
            mag = np.abs(spec)
            phase = np.angle(spec)
            
            noise_subtracted = np.maximum(mag ** 2 - self._noise_profile * reduction_factor, 1e-10)
            
            cleaned = np.sqrt(noise_subtracted) * np.exp(1j * phase)
            
            cleaned_frame = np.fft.irfft(cleaned, n=n_fft)
            
            output[i:i + n_fft] += cleaned_frame * window
            window_sum[i:i + n_fft] += window ** 2
        
        mask = window_sum > 1e-6
        output[mask] = output[mask] / window_sum[mask]
        
        return output.astype(np.float64)


class DeHummer:
    """
    Adaptive hum removal (50/60Hz and harmonics).
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._notch_filters: list = []
        self._adaptive_coeffs = np.zeros(4)

    def setup_notches(self, fundamental_hz: float = 60.0, harmonics: int = 5) -> None:
        """Setup notch filters for fundamental and harmonics."""
        self._notch_filters = []
        
        for h in range(1, harmonics + 1):
            freq = fundamental_hz * h
            if freq > self.sr / 2 - 100:
                break
            
            q = 50.0 / h if h > 1 else 30.0
            sos = signal.iirnotch(freq, q, fs=self.sr)
            self._notch_filters.append(sos)

    def process(self, y: np.ndarray, depth_db: float = 30.0) -> np.ndarray:
        """Remove hum using notch filters."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        if not self._notch_filters:
            self.setup_notches()
        
        output = y.copy()
        
        for sos in self._notch_filters:
            filtered = signal.sosfilt(sos, y)
            reduction = 10 ** (-depth_db / 20.0)
            output = output - filtered * reduction + y * reduction
        
        return output.astype(np.float64)

    def adaptive_cancel(self, y: np.ndarray, reference: np.ndarray) -> np.ndarray:
        """Adaptive noise cancellation using LMS."""
        y = np.asarray(y, dtype=np.float64).ravel()
        ref = np.asarray(reference, dtype=np.float64).ravel()
        
        if len(ref) < len(y):
            ref = np.pad(ref, (0, len(y) - len(ref)))
        elif len(ref) > len(y):
            ref = ref[:len(y)]
        
        mu = 0.001
        output = np.zeros_like(y)
        
        for i in range(len(y)):
            if i > 0:
                x_vec = np.array([ref[i], ref[i-1], output[i-1], output[i-2]])
                error = y[i] - np.dot(self._adaptive_coeffs, x_vec)
                self._adaptive_coeffs += 2 * mu * error * x_vec
                self._adaptive_coeffs = np.clip(self._adaptive_coeffs, -2, 2)
                output[i] = y[i] - np.dot(self._adaptive_coeffs[:2], ref[i:i+2])
            else:
                output[i] = y[i]
        
        return output.astype(np.float64)


class ClickDetector:
    """
    Detect and interpolate click/pop artifacts.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._click_indices: list[int] = []

    def detect(self, y: np.ndarray, threshold_multiplier: float = 5.0) -> np.ndarray:
        """Detect clicks in audio."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        envelope = np.abs(y)
        sos = signal.butter(2, 500.0, btype='low', output='sos', fs=self.sr)
        envelope = signal.sosfilt(sos, envelope)
        
        rms = np.sqrt(np.mean(envelope ** 2))
        threshold = rms * threshold_multiplier
        
        diff = np.abs(np.diff(y))
        
        clicks = []
        for i in range(len(diff) - 1):
            if diff[i] > threshold and (i == 0 or diff[i-1] < threshold * 0.5):
                clicks.append(i)
        
        self._click_indices = clicks
        return np.array(clicks)

    def interpolate(self, y: np.ndarray, click_indices: np.ndarray | None = None, interp_len: int = 5) -> np.ndarray:
        """Interpolate over detected clicks."""
        if click_indices is None:
            click_indices = np.array(self._click_indices) if self._click_indices else np.array([])
        
        if len(click_indices) == 0:
            return np.asarray(y, dtype=np.float64).ravel()
        
        y = np.asarray(y, dtype=np.float64).ravel()
        output = y.copy()
        
        for idx in click_indices:
            start = max(0, idx - interp_len)
            end = min(len(y), idx + interp_len + 1)
            
            if start == 0 or end == len(y):
                continue
            
            x = np.array([start - 1, end])
            y_vals = np.array([y[start - 1], y[end - 1]])
            
            for i in range(start, end):
                t = (i - start) / (end - start)
                output[i] = y[start - 1] * (1 - t) + y[end - 1] * t
        
        return output.astype(np.float64)


class Declipper:
    """
    Recover clipped audio samples.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(self, y: np.ndarray, threshold: float = 0.95) -> np.ndarray:
        """Interpolate over clipped regions."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        clipped_high = y > threshold
        clipped_low = y < -threshold
        
        if not (clipped_high.any() or clipped_low.any()):
            return y
        
        output = y.copy()
        
        high_regions = self._find_clipped_regions(clipped_high)
        for start, end in high_regions:
            if start > 0 and end < len(y) - 1:
                output[start:end] = self._interpolate_region(y, start, end, threshold)
        
        low_regions = self._find_clipped_regions(clipped_low)
        for start, end in low_regions:
            if start > 0 and end < len(y) - 1:
                output[start:end] = self._interpolate_region(y, start, end, -threshold)
        
        return output.astype(np.float64)

    def _find_clipped_regions(self, clipped_mask: np.ndarray) -> list[tuple[int, int]]:
        regions = []
        in_region = False
        start = 0
        
        for i, c in enumerate(clipped_mask):
            if c and not in_region:
                start = i
                in_region = True
            elif not c and in_region:
                regions.append((start, i))
                in_region = False
        
        if in_region:
            regions.append((start, len(clipped_mask)))
        
        return regions

    def _interpolate_region(self, y: np.ndarray, start: int, end: int, clip_level: float) -> np.ndarray:
        from scipy.interpolate import interp1d
        
        region_len = end - start
        if region_len < 3:
            return np.full(region_len, clip_level * 0.9)
        
        x = np.array([start - 1, end])
        y_vals = np.array([y[start - 1], y[end - 1] if end < len(y) else y[start - 1]])
        
        if len(y_vals) < 2:
            return np.full(region_len, clip_level * 0.9)
        
        f = interp1d(x, y_vals, kind='linear', fill_value='extrapolate')
        
        return f(np.arange(start, end)).astype(np.float64)