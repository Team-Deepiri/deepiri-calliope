"""Parameter automation system for time-varying effects."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable, Any

import numpy as np


class AutomationCurve(str, Enum):
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    LOGARITHMIC = "logarithmic"
    S_CURVE = "s_curve"
    STEP = "step"
    SMOOTH = "smooth"


@dataclass
class AutomationPoint:
    time_ms: float
    value: float
    curve: AutomationCurve = AutomationCurve.LINEAR


@dataclass
class AutomationTrack:
    name: str
    points: list[AutomationPoint] = field(default_factory=list)
    min_value: float = 0.0
    max_value: float = 1.0
    loop_start: float | None = None
    loop_end: float | None = None


class AutomationEngine:
    """
    Time-based parameter automation engine.
    Supports linear, exponential, S-curve interpolation.
    """

    def __init__(self):
        self._tracks: dict[str, AutomationTrack] = {}
        self._current_time_ms: float = 0.0
        self._last_sample_rate: int = 48000

    def add_track(self, name: str, min_val: float = 0.0, max_val: float = 1.0) -> AutomationTrack:
        """Add a new automation track."""
        track = AutomationTrack(name=name, min_value=min_val, max_value=max_val)
        self._tracks[name] = track
        return track

    def add_point(
        self,
        track_name: str,
        time_ms: float,
        value: float,
        curve: AutomationCurve = AutomationCurve.LINEAR,
    ) -> None:
        """Add a point to a track."""
        if track_name not in self._tracks:
            self.add_track(track_name)

        track = self._tracks[track_name]
        point = AutomationPoint(time_ms=time_ms, value=value, curve=curve)

        track.points.append(point)
        track.points.sort(key=lambda p: p.time_ms)

    def get_value(self, track_name: str, time_ms: float) -> float:
        """Get interpolated value at time."""
        if track_name not in self._tracks:
            return 0.0

        track = self._tracks[track_name]

        if not track.points:
            return track.min_value

        if time_ms <= track.points[0].time_ms:
            return self._normalize_value(track, track.points[0].value)

        if time_ms >= track.points[-1].time_ms:
            return self._normalize_value(track, track.points[-1].value)

        for i in range(len(track.points) - 1):
            p1 = track.points[i]
            p2 = track.points[i + 1]

            if p1.time_ms <= time_ms <= p2.time_ms:
                t = (time_ms - p1.time_ms) / (p2.time_ms - p1.time_ms)
                t = self._apply_curve(t, p1.curve)
                return self._normalize_value(track, p1.value + t * (p2.value - p1.value))

        return track.min_value

    def _normalize_value(self, track: AutomationTrack, value: float) -> float:
        """Normalize value to track range."""
        return np.clip(value, track.min_value, track.max_value)

    def _apply_curve(self, t: float, curve: AutomationCurve) -> float:
        """Apply curve to interpolation."""
        if curve == AutomationCurve.LINEAR:
            return t
        elif curve == AutomationCurve.EXPONENTIAL:
            return t * t
        elif curve == AutomationCurve.LOGARITHMIC:
            return np.sqrt(t)
        elif curve == AutomationCurve.S_CURVE:
            return t * t * (3 - 2 * t)
        elif curve == AutomationCurve.SMOOTH:
            return t * t * t * (10 + t * (-15 + t * 6))
        else:
            return t

    def generate_envelope(
        self,
        track_name: str,
        duration_ms: float,
        sample_rate: int = 48000,
    ) -> np.ndarray:
        """Generate full automation envelope array."""
        if track_name not in self._tracks:
            return np.zeros(int(duration_ms * sample_rate / 1000))

        track = self._tracks[track_name]
        num_samples = int(duration_ms * sample_rate / 1000)
        envelope = np.zeros(num_samples)

        for i in range(num_samples):
            time_ms = i * 1000 / sample_rate
            envelope[i] = self.get_value(track_name, time_ms)

        return envelope

    def apply_to_samples(
        self,
        samples: np.ndarray,
        track_name: str,
        processor: Callable[[np.ndarray, float], np.ndarray],
        sample_rate: int = 48000,
    ) -> np.ndarray:
        """Apply time-varying processing to samples."""
        envelope = self.generate_envelope(track_name, len(samples) / sample_rate * 1000, sample_rate)

        processed = np.zeros_like(samples)

        block_size = 512
        for i in range(0, len(samples), block_size):
            end = min(i + block_size, len(samples))
            block = samples[i:end]
            param_value = envelope[i] if i < len(envelope) else envelope[-1]
            processed[i:end] = processor(block, param_value)

        return processed

    def reset(self) -> None:
        """Reset engine state."""
        self._current_time_ms = 0.0

    def get_track(self, name: str) -> AutomationTrack | None:
        """Get track by name."""
        return self._tracks.get(name)


class LFOGenerator:
    """
    Low-frequency oscillator for modulation.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._phase = 0.0

    def generate(
        self,
        num_samples: int,
        frequency: float,
        waveform: str = "sine",
        amplitude: float = 1.0,
        offset: float = 0.0,
    ) -> np.ndarray:
        """Generate LFO signal."""
        t = np.arange(num_samples, dtype=np.float64) / self.sr + self._phase

        if waveform == "sine":
            lfo = np.sin(2 * np.pi * frequency * t)
        elif waveform == "square":
            lfo = np.sign(np.sin(2 * np.pi * frequency * t))
        elif waveform == "triangle":
            lfo = 2 * np.abs(2 * (frequency * t % 1) - 1) - 1
        elif waveform == "sawtooth":
            lfo = 2 * (frequency * t % 1) - 1
        elif waveform == "smooth_square":
            lfo = np.tanh(np.sin(2 * np.pi * frequency * t) * 3)
        elif waveform == "random":
            block_size = max(1, int(self.sr / frequency / 4))
            lfo = np.zeros(num_samples)
            for i in range(0, num_samples, block_size):
                val = np.random.randn() * 0.5
                end = min(i + block_size, num_samples)
                lfo[i:end] = val
        else:
            lfo = np.sin(2 * np.pi * frequency * t)

        self._phase = (frequency / self.sr * num_samples) % 1.0

        return (lfo * amplitude + offset).astype(np.float64)

    def reset(self) -> None:
        """Reset phase."""
        self._phase = 0.0


class ADSREnvelope:
    """
    ADSR envelope generator.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def generate(
        self,
        num_samples: int,
        attack_ms: float = 10.0,
        decay_ms: float = 100.0,
        sustain_level: float = 0.7,
        release_ms: float = 200.0,
        gate_on: int | None = None,
        gate_off: int | None = None,
    ) -> np.ndarray:
        """Generate ADSR envelope."""
        envelope = np.zeros(num_samples)

        attack_samples = int(attack_ms * self.sr / 1000)
        decay_samples = int(decay_ms * self.sr / 1000)
        release_samples = int(release_ms * self.sr / 1000)

        if gate_on is None:
            gate_on = 0

        if gate_off is None:
            gate_off = num_samples - release_samples

        for i in range(num_samples):
            if i < gate_on:
                envelope[i] = 0.0
            elif i < attack_samples + gate_on:
                t = (i - gate_on) / max(attack_samples, 1)
                envelope[i] = t
            elif i < gate_on + attack_samples + decay_samples:
                t = (i - gate_on - attack_samples) / max(decay_samples, 1)
                envelope[i] = 1.0 - (1.0 - sustain_level) * t
            elif i < gate_off:
                envelope[i] = sustain_level
            else:
                t = (i - gate_off) / max(release_samples, 1)
                envelope[i] = sustain_level * (1.0 - t)

        return envelope.astype(np.float64)


class SidechainAutomation:
    """
    Sidechain-linked automation - parameters respond to audio level.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._envelope = 0.0

    def generate(
        self,
        audio: np.ndarray,
        attack_ms: float = 5.0,
        release_ms: float = 50.0,
        threshold: float = 0.1,
        depth: float = 0.5,
        ceiling: float = 1.0,
    ) -> np.ndarray:
        """Generate sidechain-linked envelope."""
        audio = np.asarray(audio, dtype=np.float64).ravel()
        n = len(audio)

        envelope = np.zeros(n)

        attack_coef = np.exp(-1.0 / (attack_ms * self.sr / 1000))
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000))

        env = 0.0

        for i in range(n):
            level = abs(audio[i])

            if level > env:
                env = attack_coef * env + (1 - attack_coef) * level
            else:
                env = release_coef * env + (1 - release_coef) * level

            if env > threshold:
                reduction = min(ceiling, (env - threshold) / (1 - threshold) * depth)
            else:
                reduction = 0.0

            envelope[i] = 1.0 - reduction

        return envelope.astype(np.float64)

    def duck(self, audio: np.ndarray, sidechain: np.ndarray, amount: float = 0.5) -> np.ndarray:
        """Apply ducking based on sidechain signal."""
        sidechain_env = self.generate(
            sidechain,
            attack_ms=5.0,
            release_ms=100.0,
            threshold=0.05,
            depth=amount,
        )

        return (audio * sidechain_env).astype(np.float64)