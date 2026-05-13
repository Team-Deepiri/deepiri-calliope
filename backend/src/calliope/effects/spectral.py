"""Spectral processor with FFT-based operations."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy import signal


class SpectralMode(str, Enum):
    MAGNITUDE = "magnitude"
    PHASE = "phase"
    COMPLEX = "complex"


@dataclass
class SpectralConfig:
    fft_size: int = 2048
    hop: int = 512
    window: str = "hann"
    mode: SpectralMode = SpectralMode.MAGNITUDE


class SpectralProcessor:
    """
    FFT-based spectral processor.
    Apply arbitrary functions to spectral bins.
    """

    def __init__(self, sr: int = 48000, config: SpectralConfig | None = None):
        self.sr = sr
        self.config = config or SpectralConfig()

    def _get_window(self, size: int) -> np.ndarray:
        windows = {
            "hann": np.hanning,
            "hamming": np.hamming,
            "blackman": np.blackman,
            "flattop": lambda n: signal.windows.flattop(n),
        }
        fn = windows.get(self.config.window, np.hanning)
        return fn(size)

    def stft(self, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Short-time Fourier transform."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n_fft = self.config.fft_size
        hop = self.config.hop

        window = self._get_window(n_fft)

        frames = []
        for i in range(0, len(y) - n_fft + 1, hop):
            frame = y[i:i + n_fft] * window
            frames.append(frame)

        if not frames:
            return np.zeros((1, n_fft // 2 + 1)), np.zeros((1, n_fft // 2 + 1)), np.zeros(len(frames) if frames else 1)

        frames = np.stack(frames)

        spectra = np.fft.rfft(frames, n=n_fft)

        magnitude = np.abs(spectra)
        phase = np.angle(spectra)
        freqs = np.fft.rfftfreq(n_fft, 1 / self.sr)

        return magnitude, phase, freqs

    def istft(self, magnitude: np.ndarray, phase: np.ndarray) -> np.ndarray:
        """Inverse short-time Fourier transform."""
        n_fft = self.config.fft_size
        hop = self.config.hop

        spectra = magnitude * np.exp(1j * phase)

        frames = np.fft.irfft(spectra, n=n_fft)

        window = self._get_window(n_fft)

        n_output = (len(frames) - 1) * hop + n_fft
        output = np.zeros(n_output)
        window_sum = np.zeros(n_output)

        for i, frame in enumerate frames):
            start = i * hop
            output[start:start + n_fft] += frame * window
            window_sum[start:start + n_fft] += window ** 2

        mask = window_sum > 1e-8
        output[mask] = output[mask] / window_sum[mask]

        return output.astype(np.float64)

    def apply_function(
        self,
        y: np.ndarray,
        func: callable,
    ) -> np.ndarray:
        """Apply a function to the spectral representation."""
        magnitude, phase, _ = self.stft(y)

        new_mag = np.zeros_like(magnitude)
        for i in range(len(magnitude)):
            new_mag[i] = func(magnitude[i])

        return self.istft(new_mag, phase)

    def morph_spectrum(
        self,
        spectrum1: np.ndarray,
        spectrum2: np.ndarray,
        t: float,
    ) -> np.ndarray:
        """Morph between two spectra."""
        return spectrum1 * (1 - t) + spectrum2 * t


class SpectralEQ(SpectralProcessor):
    """
    Parametric EQ in the spectral domain.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._filters: list[dict] = []

    def add_filter(
        self,
        freq: float,
        gain_db: float,
        q: float = 1.0,
        filter_type: str = "peak",
    ) -> None:
        """Add an EQ filter."""
        self._filters.append({
            "freq": freq,
            "gain": gain_db,
            "q": q,
            "type": filter_type,
        })

    def process(self, y: np.ndarray) -> np.ndarray:
        """Apply spectral EQ."""
        magnitude, phase, freqs = self.stft(y)

        response = np.ones(len(freqs))

        for filt in self._filters:
            freq = filt["freq"]
            gain = filt["gain"]
            q = filt["q"]

            if freq <= 0 or freq > self.sr / 2:
                continue

            idx = np.argmin(np.abs(freqs - freq))
            width = max(1, int(q * freq / (freqs[1] - freqs[0]) if len(freqs) > 1 else 1))

            if filt["type"] == "peak":
                start = max(0, idx - width)
                end = min(len(response), idx + width + 1)

                for i in range(start, end):
                    dist = abs(i - idx) / max(width, 1)
                    if dist < 1:
                        boost = gain * (1 - dist ** 2)
                        response[i] *= 10 ** (boost / 20)

        magnitude = magnitude * response

        return self.istft(magnitude, phase)


class SpectralGate(SpectralProcessor):
    """
    Frequency-aware noise gate.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._noise_profile: np.ndarray | None = None

    def learn_noise(self, noise: np.ndarray) -> None:
        """Learn noise profile."""
        mag, _, _ = self.stft(noise)
        self._noise_profile = np.mean(mag, axis=0)

    def process(self, y: np.ndarray, threshold_multiplier: float = 2.0) -> np.ndarray:
        """Apply spectral gate."""
        if self._noise_profile is None:
            return y

        magnitude, phase, _ = self.stft(y)

        threshold = self._noise_profile * threshold_multiplier

        magnitude = np.where(magnitude > threshold, magnitude, 0)

        return self.istft(magnitude, phase)


class SpectralCompress(SpectralProcessor):
    """
    Spectral compression/expansion.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)

    def process(
        self,
        y: np.ndarray,
        threshold_db: float = -20.0,
        ratio: float = 4.0,
        knee_db: float = 6.0,
    ) -> np.ndarray:
        """Apply spectral compression."""
        magnitude, phase, _ = self.stft(y)

        threshold = 10 ** (threshold_db / 20)

        magnitude_db = 20 * np.log10(magnitude + 1e-10)

        compressed_db = np.zeros_like(magnitude_db)

        for i in range(len(magnitude_db)):
            for j in range(len(magnitude_db[i])):
                val = magnitude_db[i, j]

                if val < threshold_db - knee_db / 2:
                    compressed_db[i, j] = val
                elif val > threshold_db + knee_db / 2:
                    compressed_db[i, j] = threshold_db + (val - threshold_db) / ratio
                else:
                    x = (val - (threshold_db - knee_db / 2)) / knee_db
                    compressed_db[i, j] = threshold_db - knee_db / 2 + x * (threshold_db + knee_db / 2 - (threshold_db - knee_db / 2)) / ratio

        magnitude = 10 ** (compressed_db / 20)

        return self.istft(magnitude, phase)


class SpectralReverse(SpectralProcessor):
    """
    Spectral reversal effect.
    """

    def process(self, y: np.ndarray, freeze_time_ms: float = 500.0) -> np.ndarray:
        """Apply spectral reversal."""
        magnitude, phase, _ = self.stft(y)

        reversed_mag = magnitude[::-1]

        if freeze_time_ms > 0:
            freeze_samples = int(freeze_time_ms * self.sr / 1000 / self.config.hop)
            reversed_mag = np.concatenate([
                reversed_mag[:1],
                magnitude[1:freeze_samples],
                reversed_mag[freeze_samples:],
            ])

        return self.istft(reversed_mag, phase)


class SpectralRobotize(SpectralProcessor):
    """
    Spectral robotization effect.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)

    def process(
        self,
        y: np.ndarray,
        num_bins: int = 32,
        quantization: float = 0.5,
    ) -> np.ndarray:
        """Apply spectral robotization."""
        magnitude, phase, _ = self.stft(y)

        n_frames, n_bins = magnitude.shape

        bin_size = max(1, n_bins // num_bins)
        quantized = np.zeros_like(magnitude)

        for i in range(n_frames):
            for b in range(num_bins):
                start = b * bin_size
                end = min(start + bin_size, n_bins)

                if start >= n_bins:
                    break

                avg_mag = np.mean(magnitude[i, start:end])

                levels = int(10 * quantization) + 2
                if levels > 1:
                    step = (np.max(magnitude[i, start:end]) - np.min(magnitude[i, start:end])) / levels
                    if step > 1e-10:
                        quantized_val = np.round(avg_mag / step) * step
                    else:
                        quantized_val = avg_mag
                else:
                    quantized_val = avg_mag

                quantized[i, start:end] = quantized_val

        return self.istft(quantized, phase)


class SpectralFreeze(SpectralProcessor):
    """
    Freeze spectral content over time.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._frozen_magnitude: np.ndarray | None = None

    def capture(self, y: np.ndarray) -> None:
        """Capture current spectrum for freezing."""
        magnitude, _, _ = self.stft(y)
        self._frozen_magnitude = magnitude[0].copy()

    def process(self, y: np.ndarray, blend: float = 1.0) -> np.ndarray:
        """Apply frozen spectrum."""
        if self._frozen_magnitude is None:
            return y

        _, phase, _ = self.stft(y)

        frozen_frame = np.tile(self._frozen_magnitude, (phase.shape[0], 1))

        magnitude, _, _ = self.stft(y)

        blended = magnitude * (1 - blend) + frozen_frame * blend

        return self.istft(blended, phase)


class SpectralShift(SpectralProcessor):
    """
    Spectral shift - shift frequency content.
    """

    def process(self, y: np.ndarray, shift_hz: float = 0.0) -> np.ndarray:
        """Apply spectral shift."""
        if abs(shift_hz) < 1.0:
            return y

        magnitude, phase, _ = self.stft(y)
        freqs = np.fft.rfftfreq(self.config.fft_size, 1 / self.sr)

        bin_shift = int(shift_hz / (freqs[1] - freqs[0]) if len(freqs) > 1 else 0)

        shifted = np.zeros_like(magnitude)

        for i in range(len(magnitude)):
            if bin_shift > 0:
                shifted[i, bin_shift:] = magnitude[i, :-bin_shift]
            elif bin_shift < 0:
                shifted[i, :bin_shift] = magnitude[i, -bin_shift:]
            else:
                shifted[i] = magnitude[i]

        return self.istft(shifted, phase)