"""Real-time spectrum analyzer and FFT visualization tools."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np
from scipy import signal


class AnalyzerMode(str, Enum):
    SPECTRUM = "spectrum"
    SPECTROGRAM = "spectrogram"
    WATERFALL = "waterfall"
    OCTAVE = "octave"
    CORRELATION = "correlation"


class WindowType(str, Enum):
    HANN = "hann"
    HAMMING = "hamming"
    BLACKMAN = "blackman"
    KAISER = "kaiser"
    FLATTOP = "flattop"


@dataclass
class SpectrumAnalyzerConfig:
    mode: AnalyzerMode = AnalyzerMode.SPECTRUM
    window: WindowType = WindowType.HANN
    fft_size: int = 4096
    hop_size: int = 512
    sample_rate: int = 48000
    min_db: float = -100.0
    max_db: float = 0.0
    smoothing_ms: float = 100.0
    peak_hold: int = 60
    linear_freq: bool = False


class SpectrumAnalyzer:
    """Real-time spectrum analyzer with multiple display modes."""

    def __init__(self, config: SpectrumAnalyzerConfig | None = None):
        self.config = config or SpectrumAnalyzerConfig()
        self._peak_hold_buffer: list[np.ndarray] = []
        self._frame_count = 0
        self._history: list[np.ndarray] = []
        self._max_history = 200

    def _get_window(self, size: int) -> np.ndarray:
        window_types = {
            WindowType.HANN: lambda n: signal.windows.hann(n, fftbins=True),
            WindowType.HAMMING: lambda n: signal.windows.hamming(n, fftbins=True),
            WindowType.BLACKMAN: lambda n: signal.windows.blackman(n, fftbins=True),
            WindowType.KAISER: lambda n: signal.windows.kaiser(n, beta=14),
            WindowType.FLATTOP: lambda n: signal.windows.flattop(n, fftbins=True),
        }
        
        window_fn = window_types.get(self.config.window, window_types[WindowType.HANN])
        return window_fn(size)

    def compute_spectrum(self, samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute magnitude spectrum.
        Returns (frequencies, magnitudes_db)
        """
        y = np.asarray(samples, dtype=np.float64).ravel()
        n = len(y)
        
        if n < self.config.fft_size:
            y = np.pad(y, (0, self.config.fft_size - n))
        elif n > self.config.fft_size:
            y = y[:self.config.fft_size]
        
        window = self._get_window(self.config.fft_size)
        windowed = y * window
        
        spectrum = np.fft.rfft(spectrum, n=self.config.fft_size)
        magnitude = np.abs(spectrum)
        
        frequencies = np.fft.rfftfreq(self.config.fft_size, 1.0 / self.config.sample_rate)
        
        magnitude_db = np.zeros_like(magnitude)
        magnitude_db = np.where(
            magnitude > 1e-10,
            20.0 * np.log10(magnitude),
            self.config.min_db
        )
        magnitude_db = np.clip(magnitude_db, self.config.min_db, self.config.max_db)
        
        return frequencies, magnitude_db

    def compute_spectrogram(self, samples: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Compute spectrogram for waterfall/2D display.
        Returns (frequencies, times, spectrogram_db)
        """
        y = np.asarray(samples, dtype=np.float64).ravel()
        
        window = self._get_window(self.config.fft_size)
        
        f, t, Z = signal.spectrogram(
            y,
            fs=self.config.sample_rate,
            window=window,
            nperseg=self.config.fft_size,
            noverlap=self.config.fft_size - self.config.hop_size,
            mode='magnitude',
        )
        
        with np.errstate(divide='ignore'):
            Z_db = np.where(Z > 1e-10, 20.0 * np.log10(Z), self.config.min_db)
        
        return f, t, np.clip(Z_db, self.config.min_db, self.config.max_db)

    def compute_octave_bands(self, samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute 1/3 octave band levels (for SPL meters, etc).
        Returns (center_frequencies, levels_db)
        """
        frequencies, magnitude_db = self.compute_spectrum(samples)
        
        iso_bands = [16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250,
                     315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150,
                     4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
        
        levels = []
        centers = []
        
        for f in iso_bands:
            low = f / (2 ** (1/6))
            high = f * (2 ** (1/6))
            
            mask = (frequencies >= low) & (frequencies <= high)
            if mask.any():
                levels.append(float(np.max(magnitude_db[mask])))
                centers.append(f)
            else:
                levels.append(self.config.min_db)
                centers.append(f)
        
        return np.array(centers), np.array(levels)

    def compute_peak_hold_spectrum(self, samples: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Compute spectrum with peak hold for visual display.
        Returns (frequencies, current_magnitude, peak_magnitude)
        """
        freqs, mag = self.compute_spectrum(samples)
        
        self._peak_hold_buffer.append(mag)
        if len(self._peak_hold_buffer) > self.config.peak_hold:
            self._peak_hold_buffer.pop(0)
        
        peak_mag = np.max(self._peak_hold_buffer, axis=0)
        
        smoothing_samples = int(self.config.smoothing_ms * self.config.sample_rate / 1000.0 / self.config.hop_size)
        if smoothing_samples > 1 and len(self._history) > 0:
            smoothed = np.mean(self._history[-smoothing_samples:] + [mag], axis=0)
            mag = smoothed
        
        self._history.append(mag)
        if len(self._history) > self._max_history:
            self._history.pop(0)
        
        return freqs, mag, peak_mag

    def compute_autocorrelation(self, samples: np.ndarray, max_lag_ms: float = 100.0) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute autocorrelation for pitch detection / reverb analysis.
        Returns (lags_ms, correlation)
        """
        y = np.asarray(samples, dtype=np.float64).ravel()
        
        max_lag_samples = int(max_lag_ms * self.config.sample_rate / 1000.0)
        max_lag_samples = min(max_lag_samples, len(y) - 1)
        
        result = np.correlate(y, y, mode='full')
        result = result[len(result) // 2:]
        
        result = result[:max_lag_samples + 1]
        
        if result[0] > 1e-10:
            result = result / result[0]
        
        lags = np.arange(len(result)) * 1000.0 / self.config.sample_rate
        
        return lags, result

    def compute_cepstrum(self, samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute real cepstrum for pitch detection and harmonic analysis.
        """
        y = np.asarray(samples, dtype=np.float64).ravel()
        n = len(y)
        
        spectrum = np.fft.fft(y, n=n)
        log_magnitude = np.log(np.abs(spectrum) + 1e-10)
        
        cepstrum = np.fft.ifft(log_magnitude).real
        
        quefrency = np.arange(n) / self.config.sample_rate
        
        return quefrency, cepstrum

    def detect_harmonics(self, f0: float, max_harmonic: int = 20) -> np.ndarray:
        """Calculate expected harmonic frequencies for a given F0."""
        return np.array([f0 * h for h in range(1, max_harmonic + 1)])

    def analyze_harmonic_content(self, samples: np.ndarray, f0: float) -> dict:
        """
        Analyze harmonic content relative to fundamental.
        Returns dict with harmonic magnitudes and phase relationships.
        """
        frequencies, magnitude_db = self.compute_spectrum(samples)
        
        harmonics = self.detect_harmonics(f0)
        harmonic_magnitudes = []
        total_energy = 0.0
        
        for h_freq in harmonics:
            if h_freq > self.config.sample_rate / 2 - 1000:
                break
            
            mask = np.abs(frequencies - h_freq) < h_freq * 0.05
            if mask.any():
                harmonic_magnitudes.append(float(np.max(magnitude_db[mask])))
                total_energy += 10 ** (np.max(magnitude_db[mask]) / 20.0) ** 2
            else:
                harmonic_magnitudes.append(self.config.min_db)
        
        harmonic_magnitudes = np.array(harmonic_magnitudes)
        
        if total_energy > 1e-10:
            thd = 100.0 * np.sqrt(
                sum(10 ** (m / 20.0) ** 2 for m in harmonic_magnitudes[1:]) / total_energy
            )
        else:
            thd = 0.0
        
        return {
            "harmonics": harmonic_magnitudes.tolist(),
            "thd_percent": float(thd),
            "fundamental_db": float(harmonic_magnitudes[0]) if len(harmonic_magnitudes) > 0 else self.config.min_db,
            "num_harmonics_detected": len([h for h in harmonic_magnitudes if h > self.config.min_db + 20]),
        }

    def reset(self) -> None:
        """Reset analyzer state."""
        self._peak_hold_buffer.clear()
        self._history.clear()
        self._frame_count = 0


class RealtimeSpectrumDisplay:
    """Buffer for real-time spectrum display with averaging."""

    def __init__(self, fft_size: int = 512, avg_frames: int = 3):
        self.fft_size = fft_size
        self.avg_frames = avg_frames
        self._buffer: list[np.ndarray] = []
        self._peak_buffer: list[np.ndarray] = []

    def update(self, spectrum_db: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Add new spectrum frame, return averaged and peak hold."""
        self._buffer.append(spectrum_db.copy())
        
        if len(self._buffer) > self.avg_frames:
            self._buffer.pop(0)
        
        avg = np.mean(self._buffer, axis=0)
        
        self._peak_buffer.append(spectrum_db.copy())
        if len(self._peak_buffer) > 60:
            self._peak_buffer.pop(0)
        
        peak = np.max(self._peak_buffer, axis=0)
        
        return avg, peak

    def reset(self) -> None:
        self._buffer.clear()
        self._peak_buffer.clear()


def generate_test_tone(sr: int, frequency: float, duration_ms: float = 100.0, level_db: float = -20.0) -> np.ndarray:
    """Generate test tone for analyzer calibration."""
    n_samples = int(sr * duration_ms / 1000.0)
    t = np.arange(n_samples) / sr
    
    tone = np.sin(2 * np.pi * frequency * t)
    
    level_linear = 10 ** (level_db / 20.0)
    return (tone * level_linear).astype(np.float64)


def generate_sweep(sr: int, duration_ms: float = 1000.0, start_hz: float = 20.0, end_hz: float = 20000.0) -> np.ndarray:
    """Generate logarithmic frequency sweep for impulse response testing."""
    n_samples = int(sr * duration_ms / 1000.0)
    t = np.arange(n_samples) / sr
    
    ratio = np.log(end_hz / start_hz)
    freq = start_hz * np.exp(ratio * t / (duration_ms / 1000.0))
    
    phase = 2 * np.pi * np.cumsum(freq) / sr
    
    sweep = np.sin(phase)
    
    return sweep.astype(np.float64)


def compute_impulse_response(
    sweep: np.ndarray,
    recorded: np.ndarray,
    sr: int,
    fft_size: int = 4096,
) -> np.ndarray:
    """
    Deconvolve sweep signal from recording to get impulse response.
    """
    from scipy import signal as sp_signal
    
    n = len(recorded)
    ir = np.zeros(n)
    
    sweep_fft = np.fft.fft(sweep, n)
    recorded_fft = np.fft.fft(recorded, n)
    
    h_tilde = np.conj(sweep_fft) / (np.abs(sweep_fft) ** 2 + 1e-10)
    ir_fft = h_tilde * recorded_fft
    
    ir = np.fft.ifft(ir_fft).real
    
    window = sp_signal.windows.exponential(n, center=0, tau=n // 4)
    ir = ir * window
    
    ir = ir / (np.max(np.abs(ir)) + 1e-10) * 0.9
    
    return ir.astype(np.float64)