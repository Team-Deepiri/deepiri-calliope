"""Stem separation using source separation techniques."""

from __future__ import annotations

import numpy as np
from pathlib import Path
from dataclasses import dataclass

from calliope.audio.io import read_audio_file, write_audio_file
from calliope.config import get_settings


@dataclass
class StemConfig:
    sr: int = 48000
    fft_size: int = 4096
    hop_size: int = 1024
    num_stems: int = 4
    model_type: str = "default"


class StemSeparator:
    """Simple stem separation using spectral gating and frequency separation."""

    def __init__(self, config: StemConfig | None = None):
        self.config = config or StemConfig()

    def separate(
        self,
        samples: np.ndarray,
        sr: int = 48000,
        stem_types: list[str] | None = None,
    ) -> dict[str, np.ndarray]:
        """
        Separate audio into stems using spectral techniques.
        Returns dictionary of stem name -> audio samples.
        """
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
            mono = (left + right) / 2
        else:
            mono = samples

        if stem_types is None:
            stem_types = ["vocals", "drums", "bass", "other"]

        stems = {}

        window = np.hanning(self.config.fft_size)
        hop = self.config.hop_size
        fft = self.config.fft_size

        num_frames = (len(mono) - fft) // hop + 1

        mask_vocals = np.zeros((num_frames, fft // 2))
        mask_drums = np.zeros((num_frames, fft // 2))
        mask_bass = np.zeros((num_frames, fft // 2))
        mask_other = np.zeros((num_frames, fft // 2))

        for i in range(num_frames):
            start = i * hop
            frame = mono[start : start + fft] * window

            spectrum = np.fft.rfft(frame)
            magnitude = np.abs(spectrum)
            phase = np.angle(spectrum)

            freq_bins = np.fft.rfftfreq(fft, 1.0 / sr)

            vocal_mask = (freq_bins >= 300) & (freq_bins <= 4000)
            for_energy = np.sum(magnitude[freq_bins >= 300])
            if for_energy > np.mean(magnitude) * 3:
                vocal_mask = np.ones_like(vocal_mask) * 0.5

            drum_mask = ((freq_bins >= 60) & (freq_bins <= 200)) | (
                (freq_bins >= 2000) & (freq_bins <= 8000)
            )

            bass_mask = (freq_bins >= 30) & (freq_bins <= 200)

            other_mask = ~vocal_mask & ~drum_mask & ~bass_mask

            mask_vocals[i] = magnitude * vocal_mask
            mask_drums[i] = magnitude * drum_mask
            mask_bass[i] = magnitude * bass_mask
            mask_other[i] = magnitude * other_mask

        for stem_name, mask in [
            ("vocals", mask_vocals),
            ("drums", mask_drums),
            ("bass", mask_bass),
            ("other", mask_other),
        ]:
            if stem_name not in stem_types:
                continue

            output = np.zeros(len(mono))
            for i in range(num_frames):
                start = i * hop
                frame_spectrum = np.fft.rfft(mono[start : start + fft] * window)

                masked_spectrum = np.zeros_like(frame_spectrum)
                for j in range(len(masked_spectrum)):
                    if mask[i, j] > 0:
                        masked_spectrum[j] = frame_spectrum[j] * (mask[i, j] / (np.abs(frame_spectrum[j]) + 1e-10))
                    else:
                        masked_spectrum[j] = 0

                frame_time = np.fft.irfft(masked_spectrum)
                output[start : start + fft] += frame_time * window

            output = output / np.max(np.abs(output) + 1e-10) * 0.95

            if samples.ndim == 2:
                stems[stem_name] = np.stack([output, output], axis=1)
            else:
                stems[stem_name] = output

        return stems

    def separate_melody_bass(
        self,
        samples: np.ndarray,
        sr: int = 48000,
    ) -> dict[str, np.ndarray]:
        """Simple melody/bass separation using fundamental frequency tracking."""
        if samples.ndim == 2:
            mono = (samples[:, 0] + samples[:, 1]) / 2
        else:
            mono = samples

        from calliope.audio.spectrum import compute_spectrum

        fft = self.config.fft_size
        hop = self.config.hop_size

        melody = np.zeros_like(mono)
        bass = np.zeros_like(mono)

        num_frames = (len(mono) - fft) // hop + 1

        for i in range(num_frames):
            start = i * hop
            frame = mono[start : start + fft]

            spec = compute_spectrum(frame, sr, fft)
            freq_bins = np.fft.rfftfreq(fft, 1.0 / sr)

            low_mask = freq_bins <= 250
            high_mask = freq_bins > 250

            low_energy = np.sum(spec[low_mask])
            high_energy = np.sum(spec[high_mask])

            if high_energy > low_energy * 1.5:
                mask = high_mask
            else:
                mask = low_mask

            frame_fft = np.fft.rfft(frame * np.hanning(fft))
            frame_fft[~mask] = 0

            if np.any(high_mask):
                frame_out = np.fft.irfft(frame_fft)
                if np.any(high_mask):
                    melody[start : start + fft] += frame_out * np.hanning(fft)
                frame_fft2 = np.fft.rfft(frame * np.hanning(fft))
                frame_fft2[mask] = 0
                bass[start : start + fft] += np.fft.irfft(frame_fft2) * np.hanning(fft)

        melody = melody / np.max(np.abs(melody) + 1e-10) * 0.95
        bass = bass / np.max(np.abs(bass) + 1e-10) * 0.95

        return {"melody": melody, "bass": bass}


def separate_audio_stems(
    samples: np.ndarray,
    sr: int,
    stem_types: list[str] | None = None,
    output_dir: str | None = None,
) -> dict[str, str]:
    """
    Separate audio into stems and optionally save to disk.
    Returns dict of stem name -> file path (if saved).
    """
    separator = StemSeparator()
    stems = separator.separate(samples, sr, stem_types)

    file_paths = {}
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        for name, audio in stems.items():
            file_path = output_path / f"{name}.wav"
            write_audio_file(file_path, audio, sr, format="wav")
            file_paths[name] = str(file_path)

    return file_paths if output_dir else stems


def extract_vocals(
    samples: np.ndarray,
    sr: int,
) -> np.ndarray:
    """Extract vocal track from mixed audio."""
    separator = StemSeparator()
    stems = separator.separate(samples, sr, ["vocals"])
    return stems.get("vocals", np.zeros_like(samples))