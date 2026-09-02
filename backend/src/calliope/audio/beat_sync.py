"""Tempo detection and beat synchronization."""

from __future__ import annotations

import math

import numpy as np
from dataclasses import dataclass


@dataclass
class BeatInfo:
    tempo_bpm: float
    confidence: float
    beats: list[float]
    downbeat_sec: float | None = None
    time_signature: tuple[int, int] = (4, 4)
    phase_offset: float = 0.0


class TempoDetector:
    """Advanced tempo detection with beat tracking."""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def detect_bpm(
        self,
        samples: np.ndarray,
        min_bpm: float = 60.0,
        max_bpm: float = 200.0,
        prefer_bpm: float | None = None,
    ) -> tuple[float, float]:
        """Detect BPM using onset-envelope autocorrelation.

        Optional ``prefer_bpm`` biases half/double folding toward a session tempo
        (useful for a cappella rap takes with weak metrical evidence).
        """
        if samples.ndim == 2:
            mono = (samples[:, 0] + samples[:, 1]) / 2
        else:
            mono = samples

        mono = mono.astype(np.float64)
        if mono.size < self.sr * 0.4:
            return 120.0, 0.0

        energy = np.abs(mono)
        envelope = np.convolve(energy, np.ones(int(0.01 * self.sr)), mode="same")
        envelope = envelope / (np.max(envelope) + 1e-10)

        hop_size = 512
        onset_signal = np.zeros(len(envelope) // hop_size)

        for i in range(1, len(onset_signal)):
            diff = envelope[i * hop_size : (i + 1) * hop_size]
            prev = envelope[(i - 1) * hop_size : i * hop_size]
            onset_signal[i] = np.sum(np.maximum(0, diff - prev)) / hop_size

        # Emphasize local peaks so spoken syllables register as onsets.
        onset_signal = np.maximum(0.0, onset_signal - np.median(onset_signal))
        onset_norm = float(np.max(onset_signal) + 1e-10)
        onset_signal = onset_signal / onset_norm

        min_lag = int(60 / max_bpm * self.sr / hop_size)
        max_lag = int(60 / min_bpm * self.sr / hop_size)

        min_lag = max(min_lag, 1)
        max_lag = min(max_lag, len(onset_signal) // 2)

        if min_lag >= max_lag:
            return 120.0, 0.0

        autocorr = np.zeros(max_lag - min_lag)
        for lag in range(min_lag, max_lag):
            autocorr[lag - min_lag] = float(np.mean(onset_signal[lag:] * onset_signal[:-lag]))

        # Collect local peaks; pick the musically likeliest candidate.
        peaks: list[tuple[float, float, int]] = []
        for i in range(1, len(autocorr) - 1):
            if autocorr[i] >= autocorr[i - 1] and autocorr[i] >= autocorr[i + 1]:
                lag = i + min_lag
                bpm = 60.0 / (lag * hop_size / self.sr)
                peaks.append((float(autocorr[i]), float(bpm), lag))
        if not peaks:
            peak_idx = int(np.argmax(autocorr)) + min_lag
            peak_val = float(autocorr[peak_idx - min_lag])
            bpm = 60.0 / (peak_idx * hop_size / self.sr)
            peaks = [(peak_val, bpm, peak_idx)]

        peaks.sort(key=lambda p: p[0], reverse=True)
        top = peaks[:6]

        def _fold(bpm: float) -> float:
            b = float(bpm)
            while b < 70 and b * 2 <= max_bpm:
                b *= 2
            while b > 160 and b / 2 >= min_bpm:
                b /= 2
            return float(np.clip(b, min_bpm, max_bpm))

        scored: list[tuple[float, float, float]] = []
        for strength, bpm, _lag in top:
            folded = _fold(bpm)
            score = strength
            if prefer_bpm and prefer_bpm > 0:
                # Prefer candidates near session tempo or its half/double.
                ratios = [folded / prefer_bpm, prefer_bpm / folded]
                closeness = min(abs(math.log2(max(r, 1e-6))) for r in ratios)
                score *= 1.0 + max(0.0, 1.0 - closeness * 2.5)
            scored.append((score, folded, strength))

        scored.sort(key=lambda s: s[0], reverse=True)
        best_score, bpm, peak_val = scored[0]
        confidence = float(np.clip(peak_val * 2.2, 0.0, 1.0))
        # Soften confidence when top peaks disagree (ambiguous a cappella).
        if len(scored) >= 2:
            spread = abs(math.log2(max(scored[0][1], 1e-6) / max(scored[1][1], 1e-6)))
            if spread > 0.35:
                confidence *= 0.65
        return float(round(bpm, 1)), float(confidence)

    def find_beats(
        self,
        samples: np.ndarray,
        tempo_bpm: float,
        confidence: float,
        start_sec: float = 0.0,
    ) -> list[float]:
        """Find beat positions based on tempo."""
        if samples.ndim == 2:
            mono = (samples[:, 0] + samples[:, 1]) / 2
        else:
            mono = samples

        beat_duration = 60.0 / tempo_bpm

        energy = np.abs(mono)
        window_size = int(0.01 * self.sr)
        envelope = np.convolve(energy, np.ones(window_size), mode="same")

        onset_times = []
        threshold = np.mean(envelope) + np.std(envelope)

        for i in range(1, len(envelope)):
            if envelope[i] > envelope[i - 1] and envelope[i] > threshold:
                onset_times.append(i / self.sr)

        beat_times = []
        next_beat = start_sec

        while next_beat < len(mono) / self.sr:
            closest_onset = min(onset_times, key=lambda x: abs(x - next_beat), default=next_beat)

            if abs(closest_onset - next_beat) < beat_duration * 0.25:
                beat_times.append(closest_onset)
            else:
                beat_times.append(next_beat)

            next_beat += beat_duration

        return beat_times

    def analyze_tempo_and_beats(
        self,
        samples: np.ndarray,
        min_bpm: float = 60.0,
        max_bpm: float = 200.0,
    ) -> BeatInfo:
        """Full tempo and beat analysis."""
        tempo, confidence = self.detect_bpm(samples, min_bpm, max_bpm)

        beats = self.find_beats(samples, tempo, confidence)

        downbeat = beats[0] if beats else None

        phase_offset = 0.0
        if beats:
            phase_offset = beats[0] % (60.0 / tempo)

        return BeatInfo(
            tempo_bpm=tempo,
            confidence=confidence,
            beats=beats,
            downbeat_sec=downbeat,
            time_signature=(4, 4),
            phase_offset=phase_offset,
        )

    def estimate_swing(
        self,
        samples: np.ndarray,
        beats: list[float],
        tempo_bpm: float,
    ) -> float:
        """Estimate swing amount from beat positions."""
        if len(beats) < 4:
            return 0.0

        beat_intervals = np.diff(beats)

        even_intervals = beat_intervals[::2] if len(beat_intervals) > 1 else [0.5]
        odd_intervals = beat_intervals[1::2] if len(beat_intervals) > 2 else even_intervals

        avg_even = np.mean(even_intervals)
        avg_odd = np.mean(odd_intervals)

        if avg_even > 0:
            swing_ratio = (avg_odd - avg_even) / avg_even
        else:
            swing_ratio = 0.0

        return float(np.clip(swing_ratio, -0.5, 0.5))

    def quantize_to_grid(
        self,
        samples: np.ndarray,
        tempo_bpm: float,
        quantization: int = 16,
    ) -> np.ndarray:
        """Quantize audio to a musical grid."""
        beat_duration = 60.0 / tempo_bpm
        subdivision_duration = beat_duration / quantization

        start_sample = 0
        end_sample = len(samples)

        quantized = np.zeros_like(samples)

        return samples


def detect_tempo(samples: np.ndarray, sr: int = 48000) -> tuple[float, float]:
    """Convenience function for tempo detection."""
    detector = TempoDetector(sr)
    return detector.detect_bpm(samples)


def trim_leading_silence(
    samples: np.ndarray,
    sr: int,
    threshold: float = 0.02,
    max_trim_sec: float = 2.5,
    pad_sec: float = 0.02,
) -> np.ndarray:
    """Drop quiet lead-in so the take starts nearer bar 1 with the generated beat."""
    if samples.ndim == 2:
        mono = (samples[:, 0] + samples[:, 1]) / 2.0
    else:
        mono = samples
    mono = np.asarray(mono, dtype=np.float64)
    if mono.size == 0:
        return samples

    win = max(1, int(0.01 * sr))
    env = np.convolve(np.abs(mono), np.ones(win) / win, mode="same")
    peak = float(np.max(env) + 1e-10)
    gate = max(threshold * peak, 1e-4)
    idx = int(np.argmax(env >= gate))
    if env[idx] < gate:
        return samples
    max_trim = int(max_trim_sec * sr)
    if idx > max_trim:
        return samples
    start = max(0, idx - int(pad_sec * sr))
    if start <= 0:
        return samples
    if samples.ndim == 2:
        return samples[start:]
    return samples[start:]


def stretch_to_tempo(
    samples: np.ndarray,
    sr: int,
    from_bpm: float,
    to_bpm: float,
    *,
    min_ratio: float = 0.72,
    max_ratio: float = 1.38,
) -> tuple[np.ndarray, bool]:
    """Pitch-preserving tempo warp via WSOLA.

    Returns ``(audio, did_stretch)``. Rate uses WSOLA convention (``>1`` = slower /
    longer), i.e. ``from_bpm / to_bpm``.
    """
    if from_bpm <= 0 or to_bpm <= 0:
        return samples, False
    rate = float(from_bpm / to_bpm)
    if abs(rate - 1.0) < 0.02:
        return samples, False
    if rate < min_ratio or rate > max_ratio:
        return samples, False

    from calliope.audio.timestretch import WSOLAStretcher

    stretcher = WSOLAStretcher(sr)
    if samples.ndim == 2:
        left = stretcher.stretch(samples[:, 0], rate)
        right = stretcher.stretch(samples[:, 1], rate)
        n = min(len(left), len(right))
        return np.stack([left[:n], right[:n]], axis=1), True
    return stretcher.stretch(np.asarray(samples, dtype=np.float64).ravel(), rate), True


def sync_to_tempo(
    samples: np.ndarray,
    sr: int,
    source_tempo: float,
    target_tempo: float,
    mode: str = "stretch",
) -> np.ndarray:
    """
    Sync audio to target tempo.
    Modes: stretch, slice, warp
    """
    if abs(source_tempo - target_tempo) < 0.1:
        return samples

    stretch_factor = source_tempo / target_tempo

    if mode == "stretch":
        from scipy.signal import resample_poly

        if samples.ndim == 1:
            new_len = int(len(samples) * stretch_factor)
            return resample_poly(samples, new_len * 1000, 1000)[:new_len]
        else:
            left_new_len = int(samples.shape[0] * stretch_factor)
            left = resample_poly(samples[:, 0], left_new_len * 1000, 1000)[:left_new_len]
            right = resample_poly(samples[:, 1], left_new_len * 1000, 1000)[:left_new_len]
            return np.stack([left, right], axis=1)

    elif mode == "warp":
        detector = TempoDetector(sr)
        beats = detector.find_beats(samples, target_tempo, 0.8)

        if len(beats) < 2:
            return samples

        from scipy.signal import resample_poly

        if samples.ndim == 1:
            mono = samples
        else:
            mono = (samples[:, 0] + samples[:, 1]) / 2

        target_samples = int(len(mono) * stretch_factor)
        warped = np.zeros(target_samples)

        for i in range(len(beats) - 1):
            src_start = int(beats[i] * sr)
            src_end = int(beats[i + 1] * sr)
            src_len = src_end - src_start

            dst_start = int(beats[i] * sr * stretch_factor)
            dst_end = int(beats[i + 1] * sr * stretch_factor)
            dst_len = dst_end - dst_start

            if src_len > 0 and dst_len > 0:
                resampled = resample_poly(mono[src_start:src_end], dst_len * 1000, src_len * 1000)[:dst_len]
                warped[dst_start:dst_start + dst_len] = resampled

        if samples.ndim == 2:
            left = resample_poly(samples[:, 0], target_samples * 1000, len(samples) * 1000)[:target_samples]
            right = resample_poly(samples[:, 1], target_samples * 1000, len(samples) * 1000)[:target_samples]
            return np.stack([left, right], axis=1)

        return warped

    return samples


def adjust_phase(
    samples: np.ndarray,
    sr: int,
    offset_ms: float = 0.0,
) -> np.ndarray:
    """Adjust audio phase by offset."""
    offset_samples = int(offset_ms * sr / 1000)

    if offset_samples == 0:
        return samples

    if samples.ndim == 1:
        if offset_samples > 0:
            return np.pad(samples[offset_samples:], (0, offset_samples))
        else:
            return np.pad(samples[:offset_samples], (-offset_samples, 0))

    else:
        if offset_samples > 0:
            return np.stack([
                np.pad(samples[offset_samples:, 0], (0, offset_samples)),
                np.pad(samples[offset_samples:, 1], (0, offset_samples)),
            ], axis=1)
        else:
            return np.stack([
                np.pad(samples[:offset_samples, 0], (-offset_samples, 0)),
                np.pad(samples[:offset_samples, 1], (-offset_samples, 0)),
            ], axis=1)