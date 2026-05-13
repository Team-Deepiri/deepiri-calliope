"""Audio looping, slicing, and sample manipulation tools."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Literal


@dataclass
class LoopRegion:
    start_sec: float
    end_sec: float
    crossfade_ms: float = 10.0
    name: str = ""


@dataclass
class SliceMarker:
    position_sec: float
    label: str = ""
    color: str = "white"


class LoopSampler:
    """Professional loop sampler with crossfade and slicing."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.samples = None
        self.loops = []
        self.slices = []

    def load(self, samples: np.ndarray) -> None:
        self.samples = samples.copy() if samples.ndim == 1 else samples

    def add_loop(self, start_sec: float, end_sec: float, crossfade_ms: float = 10.0) -> LoopRegion:
        loop = LoopRegion(start_sec, end_sec, crossfade_ms)
        self.loops.append(loop)
        return loop

    def add_slice(self, position_sec: float, label: str = "", color: str = "white") -> SliceMarker:
        marker = SliceMarker(position_sec, label, color)
        self.slices.append(marker)
        self.slices.sort(key=lambda s: s.position_sec)
        return marker

    def remove_loop(self, index: int) -> None:
        if 0 <= index < len(self.loops):
            self.loops.pop(index)

    def remove_slice(self, index: int) -> None:
        if 0 <= index < len(self.slices):
            self.slices.pop(index)

    def extract_loop(self, loop: LoopRegion) -> np.ndarray:
        if self.samples is None:
            return np.array([])

        start_sample = int(loop.start_sec * self.sr)
        end_sample = int(loop.end_sec * self.sr)

        loop_audio = self.samples[start_sample:end_sample]

        if loop.crossfade_ms > 0:
            crossfade_samples = int(loop.crossfade_ms * self.sr / 1000)
            if crossfade_samples * 2 < len(loop_audio):
                fade_in = np.linspace(0, 1, crossfade_samples)
                fade_out = np.linspace(1, 0, crossfade_samples)

                loop_audio[:crossfade_samples] *= fade_in
                loop_audio[-crossfade_samples:] *= fade_out

        return loop_audio

    def loop_duration(self, loop: LoopRegion) -> float:
        return loop.end_sec - loop.start_sec

    def slice_at_transients(self, threshold_db: float = -30, min_distance_ms: float = 100) -> list[SliceMarker]:
        if self.samples is None or len(self.samples) == 0:
            return []

        mono = self.samples if self.samples.ndim == 1 else (self.samples[:, 0] + self.samples[:, 1]) / 2

        energy = np.abs(mono)
        diff = np.abs(np.diff(energy))
        diff = np.concatenate([[0], diff])

        min_distance_samples = int(min_distance_ms * self.sr / 1000)

        threshold_linear = 10 ** (threshold_db / 20)
        peaks = []
        prev_peak = -min_distance_samples

        for i in range(len(diff)):
            if diff[i] > threshold_linear and (i - prev_peak) >= min_distance_samples:
                peaks.append(i)
                prev_peak = i

        self.slices = [
            SliceMarker(position_sec=i / self.sr, label=f"Slice {j + 1}", color="cyan")
            for j, i in enumerate(peaks)
        ]

        return self.slices

    def detect_bpm_from_slices(self) -> tuple[float, float]:
        if len(self.slices) < 2:
            return 0.0, 0.0

        intervals = []
        for i in range(1, len(self.slices)):
            interval = self.slices[i].position_sec - self.slices[i - 1].position_sec
            intervals.append(interval)

        avg_interval = np.mean(intervals)

        candidate_bpms = []
        for division in [1, 2, 4]:
            candidate = 60 / (avg_interval * division)
            if 60 <= candidate <= 200:
                candidate_bpms.append((candidate, division))

        if not candidate_bpms:
            return 0.0, 0.0

        best_bpm, _ = max(candidate_bpms, key=lambda x: x[0])

        return best_bpm, 0.8

    def warp_to_tempo(self, original_bpm: float, target_bpm: float) -> np.ndarray:
        if self.samples is None or original_bpm <= 0:
            return np.array([])

        stretch_factor = original_bpm / target_bpm

        from scipy.signal import resample_poly

        if self.samples.ndim == 1:
            new_len = int(len(self.samples) * stretch_factor)
            return resample_poly(self.samples, new_len * 1000, 1000)[:new_len]
        else:
            left_new_len = int(self.samples[:, 0].shape[0] * stretch_factor)
            left = resample_poly(self.samples[:, 0], left_new_len * 1000, 1000)[:left_new_len]
            right = resample_poly(self.samples[:, 1], left_new_len * 1000, 1000)[:left_new_len]
            return np.stack([left, right], axis=1)

    def extract_slices(self) -> list[np.ndarray]:
        if self.samples is None:
            return []

        slices = []
        for i in range(len(self.slices)):
            if i == 0:
                start = 0
            else:
                start = int(self.slices[i - 1].position_sec * self.sr)

            end = int(self.slices[i].position_sec * self.sr) if i < len(self.slices) else len(self.samples)

            if end > start:
                slices.append(self.samples[start:end])
            else:
                slices.append(np.array([]))

        return slices

    def create_sliced_loop(self, target_bpm: float, slices_per_beat: int = 4) -> np.ndarray:
        if self.samples is None:
            return np.array([])

        if not self.slices:
            self.slice_at_transients()

        if not self.slices:
            return self.samples.copy()

        original_bpm, confidence = self.detect_bpm_from_slices()
        if original_bpm <= 0:
            original_bpm = 120

        beat_duration = 60 / target_bpm
        slice_duration_target = beat_duration / slices_per_beat

        slices = self.extract_slices()

        output_samples = []
        slice_idx = 0

        while len(output_samples) < self.sr * 30:
            if slice_idx >= len(slices):
                slice_idx = 0

            slice_audio = slices[slice_idx]
            if len(slice_audio) == 0:
                slice_idx += 1
                continue

            if slice_audio.ndim == 2:
                slice_audio = (slice_audio[:, 0] + slice_audio[:, 1]) / 2

            current_slice_duration = len(slice_audio) / self.sr
            stretch_factor = current_slice_duration / slice_duration_target

            if abs(stretch_factor - 1) > 0.1:
                from scipy.signal import resample_poly
                new_len = int(len(slice_audio) * stretch_factor)
                slice_audio = resample_poly(slice_audio, new_len * 1000, 1000)[:new_len]

            output_samples.extend(slice_audio.tolist())
            slice_idx += 1

        return np.array(output_samples[: int(30 * self.sr)])


def slice_audio(
    samples: np.ndarray,
    sr: int,
    method: Literal["transients", "beats", "time"] = "transients",
    sensitivity: float = 0.5,
) -> list[dict]:
    """Slice audio based on detection method."""
    if samples.ndim == 2:
        mono = (samples[:, 0] + samples[:, 1]) / 2
    else:
        mono = samples

    if method == "transients":
        energy = np.abs(mono)
        diff = np.abs(np.diff(energy))
        diff = np.concatenate([[0], diff])

        threshold = 10 ** ((-40 + sensitivity * 20) / 20)
        min_distance = int(0.05 * sr)

        markers = []
        prev = -min_distance

        for i in range(len(diff)):
            if diff[i] > threshold and (i - prev) >= min_distance:
                markers.append({"position_sec": i / sr, "type": "transient"})
                prev = i

    elif method == "beats":
        from calliope.audio.quantize import detect_tempo

        tempo, confidence = detect_tempo(mono, sr)
        beat_duration = 60 / tempo if tempo > 0 else 0.5

        markers = []
        for i in range(int(len(mono) / sr / 4)):
            markers.append({
                "position_sec": i * beat_duration,
                "type": "beat",
                "confidence": confidence if i == 0 else 0,
            })

    else:
        interval = 1.0 / sensitivity if sensitivity > 0 else 0.5
        markers = []
        pos = 0.0
        while pos < len(mono) / sr:
            markers.append({"position_sec": pos, "type": "time"})
            pos += interval

    return markers


def create_sliced_rack(
    samples: np.ndarray,
    sr: int,
    slices: list[dict],
    target_tempo: float,
) -> np.ndarray:
    """Create a sliced loop rack from sliced audio."""
    sliced_samples = []

    for i in range(len(slices)):
        start = int(slices[i]["position_sec"] * sr)
        end = int(slices[i + 1]["position_sec"] * sr) if i + 1 < len(slices) else len(samples)

        if end > start:
            sliced_samples.append(samples[start:end])

    if not sliced_samples:
        return samples

    output = []
    beat_duration = 60 / target_tempo
    slice_idx = 0

    for _ in range(8):
        if slice_idx >= len(sliced_samples):
            slice_idx = 0

        slice_audio = sliced_samples[slice_idx]
        if len(slice_audio) > 0:
            target_samples = int(beat_duration * sr)
            stretch = target_samples / len(slice_audio)

            if abs(stretch - 1) > 0.05:
                from scipy.signal import resample_poly
                new_len = int(len(slice_audio) * stretch)
                slice_audio = resample_poly(slice_audio, new_len * 1000, 1000)[:new_len]

            output.extend(slice_audio.tolist())

        slice_idx += 1

    return np.array(output[: int(8 * beat_duration * sr)])