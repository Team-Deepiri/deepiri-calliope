"""Audio style transfer using frequency-domain feature extraction.

Separates content from style via mel-spectrogram and MFCC features,
with chroma-based harmonic preservation.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from scipy import signal as scipy_signal
from scipy.fft import dct


@dataclass
class StyleTransferConfig:
    sample_rate: int = 48000
    n_fft: int = 2048
    hop_length: int = 512
    n_mels: int = 128
    n_mfcc: int = 20
    n_chroma: int = 12
    style_weight: float = 1.0
    content_weight: float = 1.0
    harmonic_weight: float = 0.5
    num_iterations: int = 50
    learning_rate: float = 0.1


class MelSpectrogram:
    """Mel-scale spectrogram extractor."""

    def __init__(self, config: StyleTransferConfig):
        self.config = config
        self.mel_basis = self._build_mel_filterbank()

    def _build_mel_filterbank(self) -> np.ndarray:
        n_fft = self.config.n_fft
        n_mels = self.config.n_mels
        sr = self.config.sample_rate

        f_min, f_max = 0.0, sr / 2.0
        mel_min = 2595.0 * np.log10(1.0 + f_min / 700.0)
        mel_max = 2595.0 * np.log10(1.0 + f_max / 700.0)
        mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
        hz_points = 700.0 * (10.0 ** (mel_points / 2595.0) - 1.0)
        bins = np.floor((n_fft + 1) * hz_points / sr).astype(int)
        bins = np.clip(bins, 0, n_fft // 2)

        fb = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
        for m in range(1, n_mels + 1):
            left = bins[m - 1]
            center = bins[m]
            right = bins[m + 1]
            for f in range(left, center):
                fb[m - 1, f] = (f - left) / (center - left) if center != left else 1.0
            for f in range(center, right):
                fb[m - 1, f] = (right - f) / (right - center) if right != center else 1.0

        return fb

    def transform(self, audio: np.ndarray) -> np.ndarray:
        _, _, stft = scipy_signal.stft(
            audio, fs=self.config.sample_rate,
            nperseg=self.config.n_fft, noverlap=self.config.n_fft - self.config.hop_length,
        )
        mag = np.abs(stft)
        mel = self.mel_basis @ mag
        return mel

    def magnitude_spectrogram(self, audio: np.ndarray) -> np.ndarray:
        _, _, stft = scipy_signal.stft(
            audio, fs=self.config.sample_rate,
            nperseg=self.config.n_fft, noverlap=self.config.n_fft - self.config.hop_length,
        )
        return np.abs(stft)


def _compute_mfcc(mel_spec: np.ndarray, n_mfcc: int) -> np.ndarray:
    log_mel = np.log(np.clip(mel_spec, 1e-10, None))
    return dct(log_mel, axis=0, type=2, norm="ortho")[:n_mfcc]


def _compute_chroma(mag_spec: np.ndarray, sr: int, n_fft: int) -> np.ndarray:
    n_chroma = 12
    freqs = np.linspace(0, sr / 2, mag_spec.shape[0])
    chroma = np.zeros((n_chroma, mag_spec.shape[1]), dtype=np.float32)

    for c in range(n_chroma):
        center_freq = 440.0 * (2.0 ** ((c - 9) / 12.0))
        for octave in range(-2, 4):
            f = center_freq * (2.0 ** octave)
            if f < sr / 2:
                idx = np.argmin(np.abs(freqs - f))
                chroma[c] += mag_spec[idx]

    return chroma


class StyleTransfer:
    """Audio style transfer with content/style separation and chroma preservation."""

    def __init__(self, config: StyleTransferConfig | None = None):
        self.config = config or StyleTransferConfig()
        self.mel_extractor = MelSpectrogram(self.config)

    def extract_features(self, audio: np.ndarray) -> dict[str, np.ndarray]:
        """Extract mel-spectrogram, MFCC, and chroma features.

        Args:
            audio: (n_samples,) mono audio.

        Returns:
            dict with 'mel', 'mfcc', 'chroma', 'magnitude' keys.
        """
        mel = self.mel_extractor.transform(audio)
        mag = self.mel_extractor.magnitude_spectrogram(audio)
        mfcc = _compute_mfcc(mel, self.config.n_mfcc)
        chroma = _compute_chroma(mag, self.config.sample_rate, self.config.n_fft)

        return {
            "mel": mel,
            "mfcc": mfcc,
            "chroma": chroma,
            "magnitude": mag,
        }

    def _gram_matrix(self, x: np.ndarray) -> np.ndarray:
        feat = x.reshape(x.shape[0], -1)
        gram = feat @ feat.T
        return gram / feat.size

    def _style_loss(self, source_style: np.ndarray, target_style: np.ndarray) -> float:
        return float(np.mean((self._gram_matrix(source_style) - self._gram_matrix(target_style)) ** 2))

    def _content_loss(self, source_content: np.ndarray, target_content: np.ndarray) -> float:
        return float(np.mean((source_content - target_content) ** 2))

    def _harmonic_loss(self, source_chroma: np.ndarray, target_chroma: np.ndarray) -> float:
        return float(np.mean((source_chroma - target_chroma) ** 2))

    def transfer_style(
        self, content_audio: np.ndarray, style_audio: np.ndarray,
    ) -> np.ndarray:
        """Transfer style from style_audio to content_audio.

        Uses iterative optimization in the frequency domain to match
        style feature statistics while preserving content structure.

        Args:
            content_audio: (n_samples,) content audio.
            style_audio: (n_samples,) style audio.

        Returns:
            (n_samples,) stylized audio.
        """
        content_feats = self.extract_features(content_audio)
        style_feats = self.extract_features(style_audio)

        _, _, Zxx = scipy_signal.stft(
            content_audio, fs=self.config.sample_rate,
            nperseg=self.config.n_fft, noverlap=self.config.n_fft - self.config.hop_length,
        )
        stft_matrix = Zxx.copy()

        _, n_freq, n_time = Zxx.shape
        n_freq_bins = n_freq

        content_mag = content_feats["magnitude"]
        content_mfcc = content_feats["mfcc"]
        content_chroma = content_feats["chroma"]
        style_mfcc = style_feats["mfcc"]
        style_chroma = style_feats["chroma"]

        mag_current = content_mag.copy()

        for iteration in range(self.config.num_iterations):
            mag_current = self._optimize_step(
                mag_current, content_mag, style_mfcc, style_chroma,
                content_mfcc, content_chroma, iteration,
            )

        phase = np.angle(stft_matrix)
        _, x_rec = scipy_signal.istft(
            mag_current * np.exp(1j * phase),
            fs=self.config.sample_rate,
            nperseg=self.config.n_fft, noverlap=self.config.n_fft - self.config.hop_length,
        )

        peak = np.max(np.abs(x_rec))
        if peak > 1e-8:
            x_rec = x_rec / peak

        return x_rec.astype(np.float32)

    def _optimize_step(
        self, mag: np.ndarray, content_mag: np.ndarray,
        style_mfcc: np.ndarray, style_chroma: np.ndarray,
        content_mfcc: np.ndarray, content_chroma: np.ndarray,
        iteration: int,
    ) -> np.ndarray:
        lr = self.config.learning_rate * (1.0 - iteration / self.config.num_iterations)

        mag_mel = self.mel_extractor.mel_basis @ mag
        mag_mfcc = _compute_mfcc(mag_mel, self.config.n_mfcc)
        mag_chroma = _compute_chroma(mag, self.config.sample_rate, self.config.n_fft)

        d_mfcc = mag_mfcc - style_mfcc
        d_content = mag - content_mag
        d_chroma = mag_chroma - style_chroma

        grad = np.zeros_like(mag)

        if mag_mel.shape[0] > self.config.n_mfcc:
            d_mfcc_pad = np.pad(d_mfcc, ((0, mag_mel.shape[0] - self.config.n_mfcc), (0, 0)), mode="constant")
            grad += self.config.style_weight * d_mfcc_pad / mag_mel.shape[0]

        grad += self.config.content_weight * d_content / mag.size
        grad += self.config.harmonic_weight * d_chroma[:mag.shape[0], :mag.shape[1]] / mag.size

        mag = mag - lr * grad
        mag = np.clip(mag, 1e-6, None)

        return mag
