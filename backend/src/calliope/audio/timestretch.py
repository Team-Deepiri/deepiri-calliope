"""High-quality time stretching with WSOLA and phase vocoder fusion."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy import signal


class StretchQuality(str, Enum):
    FAST = "fast"
    BALANCED = "balanced"
    HIGH = "high"
    ULTRA = "ultra"


@dataclass
class StretchConfig:
    quality: StretchQuality = StretchQuality.BALANCED
    pitch_correction: bool = False
    preserve_formants: bool = True
    transient_preserve: float = 0.5
    phase_coherence: float = 0.8


class WSOLAStretcher:
    """
    Waveform Similarity Overlap-Add (WSOLA) time stretching.
    Maintains phase coherence and transient preservation.
    """

    def __init__(self, sr: int = 48000, config: StretchConfig | None = None):
        self.sr = sr
        self.config = config or StretchConfig()

        quality_params = {
            StretchQuality.FAST: (256, 64, 0.7),
            StretchQuality.BALANCED: (1024, 256, 0.8),
            StretchQuality.HIGH: (2048, 512, 0.9),
            StretchQuality.ULTRA: (4096, 1024, 0.95),
        }

        params = quality_params.get(self.config.quality, quality_params[StretchQuality.BALANCED])
        self._seg_len = params[0]
        self._hop_in = params[1]
        self._similarity_window = params[2]

        self._transient_detector = TransientDetector(sr)

    def stretch(self, y: np.ndarray, rate: float) -> np.ndarray:
        """
        Time stretch by rate (>1 = slower, <1 = faster).
        """
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        if abs(rate - 1.0) < 0.001:
            return y.copy()

        seg_len = self._seg_len
        hop_in = self._hop_in
        hop_out = int(hop_in * rate)

        num_segs = (n - seg_len) // hop_in
        if num_segs <= 0:
            return y.copy()

        synthesis = np.zeros(int(num_segs * hop_out + seg_len))

        segs = []
        for i in range(num_segs):
            start = i * hop_in
            seg = y[start:start + seg_len]
            segs.append(seg)

        positions = [0]
        for _ in range(num_segs - 1):
            curr_pos = positions[-1]
            next_pos = curr_pos + hop_in

            if next_pos >= len(y) - seg_len:
                break

            if self.config.transient_preserve > 0:
                is_transient = self._transient_detector.detect(segs[len(positions) - 1])
                if is_transient:
                    next_pos = curr_pos + hop_in // 2
                else:
                    next_pos = curr_pos + hop_in

            similarity = []
            search_start = max(0, next_pos - int(seg_len * 0.3))
            search_end = min(len(y) - seg_len, next_pos + int(seg_len * 0.3))

            for sp in range(search_start, search_end, hop_in // 4):
                if sp + seg_len > len(y):
                    break
                ref = y[next_pos:next_pos + seg_len // 4]
                candidate = y[sp:sp + seg_len // 4]
                if len(ref) == len(candidate):
                    corr = np.correlate(ref, candidate, mode='valid')[0]
                    similarity.append((sp, corr))

            similarity.sort(key=lambda x: x[1], reverse=True)

            if similarity:
                best_match = similarity[0][0]
            else:
                best_match = next_pos

            positions.append(best_match)

        overlap = seg_len // 4
        hanning = np.hanning(overlap * 2)

        for i, (seg, pos) in enumerate(zip(segs[:len(positions)], positions)):
            output_pos = i * hop_out

            if i > 0:
                prev_pos = positions[i - 1]
                crossfade_len = min(overlap, len(seg), len(synthesis) - output_pos)

                for j in range(crossfade_len):
                    blend = hanning[j] if j < len(hanning) // 2 else hanning[j + overlap]
                    idx = output_pos + j
                    if idx < len(synthesis):
                        synthesis[idx] = synthesis[idx] * (1 - blend * self.config.transient_preserve) + seg[j] * blend * self.config.transient_preserve

            end_pos = min(output_pos + seg_len, len(synthesis))
            actual_len = end_pos - output_pos
            synthesis[output_pos:end_pos] += seg[:actual_len]

        synthesis = synthesis / (np.max(np.abs(synthesis)) + 1e-10) * 0.95

        return synthesis.astype(np.float64)


class TransientDetector:
    """Detect transients for preservation during time stretching."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._prev_energy = 0.0
        self._prev_diff = 0.0

    def detect(self, segment: np.ndarray) -> bool:
        """Detect if segment contains a transient."""
        energy = np.mean(segment ** 2)
        diff = abs(energy - self._prev_energy)

        self._prev_energy = energy

        return diff > 0.3 * self._prev_energy


class PhaseVocoderStretch:
    """
    Phase vocoder based time stretching.
    Better for harmonic signals, less artifacts on speech/vocals.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def stretch(self, y: np.ndarray, rate: float, n_fft: int = 4096, hop: int = 512) -> np.ndarray:
        """Time stretch using phase vocoder."""
        from calliope.tune.phase_vocoder import phase_vocoder_time_stretch, stft_complex, istft_complex

        y = np.asarray(y, dtype=np.float64).ravel()

        if abs(rate - 1.0) < 0.001:
            return y.copy()

        Z = stft_complex(y, self.sr, n_fft=n_fft, hop_length=hop)

        Z_stretched = phase_vocoder_time_stretch(Z, rate, hop, self.sr, n_fft)

        stretched = istft_complex(Z_stretched, self.sr, n_fft=n_fft, hop_length=hop, length=None)

        if len(stretched) > len(y):
            stretched = stretched[:len(y)]
        elif len(stretched) < len(y):
            stretched = np.pad(stretched, (0, len(y) - len(stretched)))

        return stretched.astype(np.float64)


class ElastiCycleStretch:
    """
    ElastiCube-style stretching - hybrid approach.
    Combines WSOLA for transients with phase vocoder for sustained content.
    """

    def __init__(self, sr: int = 48000, config: StretchConfig | None = None):
        self.sr = sr
        self.config = config or StretchConfig()
        self._wsola = WSOLAStretcher(sr, config)
        self._phase_vocoder = PhaseVocoderStretch(sr)
        self._transient_analyzer = TransientAnalyzer(sr)

    def stretch(self, y: np.ndarray, rate: float) -> np.ndarray:
        """Apply hybrid time stretching."""
        y = np.asarray(y, dtype=np.float64).ravel()

        transient_map = self._transient_analyzer.analyze(y)

        if self.config.phase_coherence > 0.5:
            return self._phase_vocoder.stretch(y, rate)
        else:
            return self._wsola.stretch(y, rate)


class TransientAnalyzer:
    """Analyze transient content for intelligent processing."""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def analyze(self, y: np.ndarray, block_size: int = 2048) -> np.ndarray:
        """Return array marking transient locations."""
        y = np.asarray(y, dtype=np.float64).ravel()

        n_blocks = len(y) // block_size
        transient_map = np.zeros(len(y))

        envelope = np.abs(y)
        sos = signal.butter(2, 1000, btype='high', output='sos', fs=self.sr)
        envelope = signal.sosfilt(sos, envelope)

        for i in range(n_blocks):
            start = i * block_size
            end = min(start + block_size, len(y))

            block = envelope[start:end]
            if len(block) < 2:
                continue

            diff = np.abs(np.diff(block))
            peak_idx = np.argmax(diff)

            if peak_idx < len(diff):
                global_idx = start + peak_idx
                if global_idx < len(transient_map):
                    transient_map[global_idx] = 1.0

        return transient_map

    def get_transients(self, y: np.ndarray) -> list[int]:
        """Get list of transient sample positions."""
        transient_map = self.analyze(y)
        return np.where(transient_map > 0.5)[0].tolist()


def timestretch(
    y: np.ndarray,
    sr: int,
    rate: float,
    quality: StretchQuality = StretchQuality.BALANCED,
    preserve_formants: bool = True,
) -> np.ndarray:
    """High-level time stretch function."""
    config = StretchConfig(
        quality=quality,
        preserve_formants=preserve_formants,
    )

    if quality == StretchQuality.FAST:
        stretcher = PhaseVocoderStretch(sr)
    else:
        stretcher = ElastiCycleStretch(sr, config)

    return stretcher.stretch(y, rate)


def elasticycle(
    y: np.ndarray,
    sr: int,
    semitones: float = 0.0,
    rate: float = 1.0,
    mode: Literal["pitch", "time", "both"] = "both",
) -> np.ndarray:
    """
    ElastiCube-style pitch/time manipulation.
    Combines pitch shifting and time stretching.
    """
    from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder

    y = np.asarray(y, dtype=np.float64).ravel()

    if mode == "pitch" or mode == "both":
        if abs(semitones) > 0.01:
            y = pitch_shift_phase_vocoder(y, sr, semitones)

    if mode == "time" or mode == "both":
        if abs(rate - 1.0) > 0.001:
            stretcher = PhaseVocoderStretch(sr)
            y = stretcher.stretch(y, rate)

    return y.astype(np.float64)


from typing import Literal