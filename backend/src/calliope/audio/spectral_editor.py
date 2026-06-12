"""FFT spectral editing with gating, masking, and harmonic preservation."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from numpy.lib.stride_tricks import sliding_window_view


@dataclass
class SpectralEditingParams:
    noise_reduction_db: float = 6.0
    harmonic_enhance_db: float = 3.0
    gate_threshold_db: float = -60.0
    preserve_harmonics: bool = True
    freq_mask_width: int = 3


class SpectralEditor:
    """Spectral editing via STFT/ISTFT with overlap-add, noise gating, and harmonic enhancement."""

    def __init__(self, n_fft: int = 2048, hop_length: int = 512, window: str = "hann"):
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.window = np.hanning(n_fft)
        self.params = SpectralEditingParams()

    def stft(self, samples: np.ndarray) -> np.ndarray:
        """Compute STFT with Hann window, returns complex spectrogram (freqs, frames)."""
        samples = np.asarray(samples, dtype=np.float64)
        if samples.ndim == 2:
            samples = np.mean(samples, axis=1)
        n = self.n_fft
        hop = self.hop_length
        pad = n // 2
        y = np.pad(samples, (pad, pad), mode="reflect")
        n_frames = 1 + (len(y) - n) // hop
        shape = (n_frames, n)
        strides = (y.strides[0] * hop, y.strides[0])
        frames = sliding_window_view(y, n)[::hop]
        if len(frames) < n_frames:
            frames = np.lib.stride_tricks.sliding_window_view(y, n)[::hop][:n_frames]
        win = self.window[np.newaxis, :]
        frames = np.ascontiguousarray(frames[:n_frames]) * win
        return np.fft.rfft(frames, n=n)

    def istft(self, spectrogram: np.ndarray, length: int | None = None) -> np.ndarray:
        """Reconstruct time-domain signal from complex spectrogram via overlap-add."""
        n = self.n_fft
        hop = self.hop_length
        frames = np.fft.irfft(spectrogram, n=n)
        frames *= self.window[np.newaxis, :]
        n_frames = frames.shape[0]
        out_len = (n_frames - 1) * hop + n
        output = np.zeros(out_len, dtype=np.float64)
        wsum = np.zeros(out_len, dtype=np.float64)
        win2 = self.window ** 2
        for i in range(n_frames):
            start = i * hop
            output[start:start + n] += frames[i]
            wsum[start:start + n] += win2
        wsum = np.where(wsum < 1e-10, 1.0, wsum)
        output /= wsum
        pad = n // 2
        output = output[pad:]
        if length is not None:
            output = output[:length]
        return output

    def edit_spectral(
        self,
        samples: np.ndarray,
        edit_fn: callable | None = None,
    ) -> np.ndarray:
        """Apply arbitrary spectral editing function to magnitude spectrogram.

        edit_fn(magnitude_db, phase) -> modified_magnitude_db
        """
        spec = self.stft(samples)
        magnitude = np.abs(spec)
        phase = np.angle(spec)
        magnitude_db = 20 * np.log10(np.clip(magnitude, 1e-10, None))

        if edit_fn is not None:
            magnitude_db = edit_fn(magnitude_db, phase)

        magnitude = 10 ** (np.clip(magnitude_db, -120, 100) / 20)
        modified = magnitude * np.exp(1j * phase)
        return self.istft(modified, length=len(samples))

    def reduce_noise(
        self,
        samples: np.ndarray,
        noise_floor_db: float | None = None,
    ) -> np.ndarray:
        """Spectral gating noise reduction using a noise floor estimate."""
        threshold = noise_floor_db if noise_floor_db is not None else self.params.noise_reduction_db

        def gate(mag_db: np.ndarray, phase: np.ndarray) -> np.ndarray:
            noise_est = np.percentile(mag_db, 15, axis=1, keepdims=True)
            mask = mag_db > (noise_est + threshold)
            output = np.where(mask, mag_db, noise_est - 6)
            smooth = np.ones((1, 3)) / 3
            from scipy.ndimage import convolve1d
            output = convolve1d(output, smooth, axis=0, mode="nearest")
            return output

        return self.edit_spectral(samples, edit_fn=gate)

    def enhance_harmonics(
        self,
        samples: np.ndarray,
        strength_db: float | None = None,
    ) -> np.ndarray:
        """Enhance harmonic content by boosting spectral peaks."""
        boost = strength_db if strength_db is not None else self.params.harmonic_enhance_db

        def enhance(mag_db: np.ndarray, phase: np.ndarray) -> np.ndarray:
            n_freqs = mag_db.shape[0]
            local_max = np.zeros_like(mag_db)
            for f in range(1, n_freqs - 1):
                peak_mask = (mag_db[f] > mag_db[f - 1]) & (mag_db[f] > mag_db[f + 1])
                local_max[f] = np.where(peak_mask, 1.0, 0.0)
            smoothed = np.where(local_max > 0, mag_db + boost, mag_db)
            return smoothed

        return self.edit_spectral(samples, edit_fn=enhance)

    def remove_frequency_range(self, samples: np.ndarray, f_min: float, f_max: float, sr: int) -> np.ndarray:
        """Remove a frequency range from the signal."""
        freqs = np.fft.rfftfreq(self.n_fft, 1.0 / sr)

        def remove(mag_db: np.ndarray, phase: np.ndarray) -> np.ndarray:
            mask = (freqs[:, np.newaxis] >= f_min) & (freqs[:, np.newaxis] <= f_max)
            output = mag_db.copy()
            output[mask] = -120.0
            return output

        return self.edit_spectral(samples, edit_fn=remove)

    def apply_frequency_mask(self, samples: np.ndarray, mask: np.ndarray, sr: int) -> np.ndarray:
        """Apply a custom frequency mask (n_freqs,) to the spectrogram."""
        def apply_mask(mag_db: np.ndarray, phase: np.ndarray) -> np.ndarray:
            full_mask = mask[:, np.newaxis]
            return mag_db * full_mask

        return self.edit_spectral(samples, edit_fn=apply_mask)
