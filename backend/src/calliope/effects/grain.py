"""Grain cloud sampler effect."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy import signal


class GrainMode(str, Enum):
    TIME = "time"
    FREQUENCY = "frequency"
    PITCH = "pitch"
    FORMANT = "formant"


@dataclass
class GrainConfig:
    grain_size_ms: float = 30.0
    grain_overlap: float = 0.5
    grain_density: float = 0.5
    pitch_semitones: float = 0.0
    pitch_variance: float = 0.0
    position_variance: float = 0.0
    reverse_probability: float = 0.0
    freeze: bool = False
    scatter: float = 0.0
    texture: float = 0.0
    window_type: str = "hann"


class GrainCloud:
    """
    Granular synthesis engine for cloud-like textures.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = GrainConfig()
        self._buffer: np.ndarray | None = None
        self._grain_positions: list[int] = []
        self._random = np.random.RandomState(42)

    def set_source(self, audio: np.ndarray) -> None:
        """Set source audio buffer."""
        self._buffer = np.asarray(audio, dtype=np.float64).ravel()
        self._grain_positions = list(range(0, max(1, len(self._buffer) - int(self.config.grain_size_ms * self.sr / 1000)), 100))

    def _get_window(self, size: int) -> np.ndarray:
        """Get grain window function."""
        if self.config.window_type == "hann":
            return np.hanning(size)
        elif self.config.window_type == "hamming":
            return np.hamming(size)
        elif self.config.window_type == "blackman":
            return np.blackman(size)
        elif self.config.window_type == "triangular":
            return np.abs(np.linspace(-1, 1, size)) * 2 - 1
        elif self.config.window_type == "square":
            return np.ones(size)
        else:
            return np.hanning(size)

    def _select_grain_position(self, base_pos: int) -> int:
        """Select grain position with variance."""
        if self._buffer is None:
            return base_pos

        variance = int(self.config.position_variance * len(self._buffer) * 0.1)
        pos = base_pos + self._random.randint(-variance, variance + 1)
        return max(0, min(pos, len(self._buffer) - 1))

    def _pitch_shift_grain(self, grain: np.ndarray, semitones: float) -> np.ndarray:
        """Pitch shift a grain."""
        if abs(semitones) < 0.1:
            return grain

        ratio = 2.0 ** (semitones / 12.0)
        num_samples = int(len(grain) / ratio)

        resampled = signal.resample(grain, num_samples)

        if len(resampled) < len(grain):
            resampled = np.pad(resampled, (0, len(grain) - len(resampled)))
        elif len(resampled) > len(grain):
            resampled = resampled[:len(grain)]

        return resampled

    def generate_grain(self) -> np.ndarray | None:
        """Generate a single grain."""
        if self._buffer is None or len(self._grain_positions) == 0:
            return None

        base_pos = self._random.choice(self._grain_positions)
        pos = self._select_grain_position(base_pos)

        grain_size = int(self.config.grain_size_ms * self.sr / 1000)
        grain_size = min(grain_size, len(self._buffer) - pos)

        if grain_size < 10:
            return None

        grain = self._buffer[pos:pos + grain_size].copy()

        if self._random.random() < self.config.reverse_probability:
            grain = grain[::-1]

        if self.config.pitch_variance > 0:
            pitch_var = self._random.uniform(
                -self.config.pitch_variance,
                self.config.pitch_variance
            )
        else:
            pitch_var = 0

        total_pitch = self.config.pitch_semitones + pitch_var
        if abs(total_pitch) > 0.1:
            grain = self._pitch_shift_grain(grain, total_pitch)

        window = self._get_window(len(grain))
        grain = grain * window

        return grain

    def process(
        self,
        output_length: int,
        mode: GrainMode = GrainMode.TIME,
    ) -> np.ndarray:
        """Generate grain cloud output."""
        if self._buffer is None:
            return np.zeros(output_length)

        output = np.zeros(output_length)
        grain_size = int(self.config.grain_size_ms * self.sr / 1000)

        hop_size = int(grain_size * (1 - self.config.grain_overlap * self.config.grain_density))

        if hop_size < 1:
            hop_size = 1

        position = 0
        grain_count = 0
        max_grains = int(output_length / hop_size) * 2

        while position < output_length and grain_count < max_grains:
            grain = self.generate_grain()

            if grain is not None:
                end_pos = min(position + len(grain), output_length)
                actual_len = end_pos - position

                if mode == GrainMode.PITCH or mode == GrainMode.FORMANT:
                    scatter = int(self.config.scatter * grain_size * 0.2)
                    scatter_offset = self._random.randint(-scatter, scatter + 1)
                    pos = max(0, min(position + scatter_offset, output_length - actual_len))
                else:
                    pos = position

                output[pos:pos + actual_len] += grain[:actual_len]

            position += hop_size
            grain_count += 1

        output = output / (np.max(np.abs(output)) + 1e-10) * 0.9

        return output.astype(np.float64)

    def process_cloud(
        self,
        input_audio: np.ndarray,
        output_length: int,
        density: float = 0.5,
        pitch_range: tuple[float, float] = (-12.0, 12.0),
        size_range: tuple[float, float] = (10.0, 100.0),
    ) -> np.ndarray:
        """Process input audio as grain cloud."""
        self.set_source(input_audio)

        if density < self.config.grain_density:
            self.config.grain_density = density

        return self.process(output_length, GrainMode.TIME)


class FormantGrain:
    """
    Formant-preserving grain synthesis.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def extract_formants(self, segment: np.ndarray) -> list[tuple[float, float]]:
        """Extract formants from audio segment."""
        from calliope.voice.multiband import compute_formant_features
        return compute_formant_features(segment, self.sr)

    def apply_formants(self, grain: np.ndarray, target_formants: list[tuple[float, float]]) -> np.ndarray:
        """Apply target formants to grain."""
        source_formants = self.extract_formants(grain)

        if not source_formants or not target_formants:
            return grain

        avg_source = np.mean([f[0] for f in source_formants])
        avg_target = np.mean([f[0] for f in target_formants])

        if avg_source > 50:
            shift = avg_target / avg_source
            shift = max(0.5, min(2.0, shift))

            from calliope.voice.formant_shift import formant_shift_stft
            return formant_shift_stft(grain, self.sr, shift=shift, n_fft=1024, hop=256)

        return grain

    def morph(
        self,
        grain1: np.ndarray,
        grain2: np.ndarray,
        mix: float = 0.5,
    ) -> np.ndarray:
        """Morph between two grains preserving formants."""
        formants1 = self.extract_formants(grain1)
        formants2 = self.extract_formants(grain2)

        blended_formants = [(f1[0] * (1 - mix) + f2[0] * mix, f1[1] * (1 - mix) + f2[1] * mix)
                          for f1, f2 in zip(formants1, formants2)]

        blended = grain1 * (1 - mix) + grain2 * mix

        return self.apply_formants(blended, blended_formants).astype(np.float64)


class ScatterEffect:
    """
    Time-scattered grain effect for glitchy textures.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._random = np.random.RandomState(42)

    def process(
        self,
        audio: np.ndarray,
        scatter_amount: float = 0.3,
        grain_size: int = 256,
    ) -> np.ndarray:
        """Apply scatter effect to audio."""
        audio = np.asarray(audio, dtype=np.float64).ravel()
        n = len(audio)

        output = np.zeros(n)

        for i in range(0, n, grain_size):
            grain = audio[i:i + grain_size]
            if len(grain) == 0:
                continue

            scatter = int(scatter_amount * grain_size * self._random.random())

            dest_pos = i + scatter
            if dest_pos + len(grain) <= n:
                output[dest_pos:dest_pos + len(grain)] += grain
            else:
                remaining = n - dest_pos
                if remaining > 0:
                    output[dest_pos:n] += grain[:remaining]

        output = output / (np.max(np.abs(output)) + 1e-10) * 0.9

        return output.astype(np.float64)


class TextureSynthesis:
    """
    Create textures from audio snippets.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def create_texture(
        self,
        audio: np.ndarray,
        duration_ms: float = 2000.0,
        density: float = 0.8,
        complexity: float = 0.5,
    ) -> np.ndarray:
        """Create textured texture from audio."""
        from scipy.ndimage import uniform_filter1d

        audio = np.asarray(audio, dtype=np.float64).ravel()

        output_length = int(duration_ms * self.sr / 1000)

        spectral = np.abs(np.fft.rfft(audio))
        phase = np.angle(np.fft.rfft(audio))

        texture = np.zeros(output_length, dtype=np.complex128)

        hop = int(len(spectral) * (1 - density) * 0.5)
        for i in range(0, len(texture), hop):
            chunk_len = min(len(spectral), len(texture) - i)

            chunk = np.zeros_like(texture[i:i + chunk_len])
            chunk[:len(spectral)] = spectral[:chunk_len] * np.exp(1j * phase[:chunk_len])

            smoothed = uniform_filter1d(np.abs(chunk), size=int(complexity * 20) + 1)

            chunk_mag = smoothed
            chunk_ph = phase[:len(chunk_mag)] + self._random.randn(len(chunk_mag)) * complexity * np.pi

            texture[i:i + chunk_len] = chunk_mag * np.exp(1j * chunk_ph)

        result = np.fft.irfft(texture)

        result = result / (np.max(np.abs(result)) + 1e-10) * 0.9

        return result.astype(np.float64)

    def _random(self):
        return np.random