"""Advanced algorithmic reverbs - shimmer, gated, reverse, freeze."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np
from scipy import signal


class ReverbType(str, Enum):
    ROOM = "room"
    HALL = "hall"
    PLATE = "plate"
    CATHEDRAL = "cathedral"
    CHAMBER = "chamber"
    SHIMMER = "shimmer"
    GATED = "gated"
    REVERSE = "reverse"
    FREEZE = "freeze"
    ECHO_PLANE = "echo_plane"


@dataclass
class ReverbConfig:
    reverb_type: ReverbType = ReverbType.ROOM
    size: float = 0.5
    decay: float = 2.0
    pre_delay: float = 20.0
    damping: float = 0.5
    density: float = 0.8
    diffusion: float = 0.8
    modulation: float = 0.0
    shimmer_octaves: float = 2.0
    shimmer_mix: float = 0.3
    freeze_decay: float = 0.0
    wet: float = 0.4
    high_cut: float = 15000.0
    low_cut: float = 50.0


class ShimmerReverb:
    """
    Shimmer reverb with pitch-shifted harmonics.
    Creates ethereal, shimmering quality by adding octaved content.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = ReverbConfig(reverb_type=ReverbType.SHIMMER)
        self._early_lines: list[np.ndarray] = []
        self._late_lines: list[np.ndarray] = []
        self._shimmer_lines: list[np.ndarray] = []
        self._initialize_diffusion_network()

    def _initialize_diffusion_network(self) -> None:
        """Create a diffusion network of delay lines."""
        num_early = 7
        num_late = 12
        num_shimmer = 4

        base_delay = 50 + self.config.size * 100

        self._early_lines = []
        for i in range(num_early):
            delay_samples = int((base_delay + i * 17) * self.sr / 1000.0)
            if delay_samples < 1:
                delay_samples = 1
            self._early_lines.append(np.zeros(delay_samples))

        self._late_lines = []
        for i in range(num_late):
            delay_samples = int((base_delay * 2 + i * 31 + i * i * 5) * self.sr / 1000.0)
            if delay_samples < 1:
                delay_samples = 1
            self._late_lines.append(np.zeros(delay_samples))

        self._shimmer_lines = []
        for i in range(num_shimmer):
            delay_samples = int((base_delay + 100 + i * 53) * self.sr / 1000.0)
            if delay_samples < 1:
                delay_samples = 1
            self._shimmer_lines.append(np.zeros(delay_samples))

    def _diffuse(self, input_sig: np.ndarray, lines: list[np.ndarray], feedback: float, decay: float) -> np.ndarray:
        """Process through diffusion network."""
        output = np.zeros_like(input_sig)
        n = len(input_sig)

        for line in lines:
            line_len = len(line)
            new_line = np.zeros_like(line)

            for i in range(n):
                idx = i % line_len
                read_idx = (idx - 1) % line_len if idx > 0 else line_len - 1

                input_sample = input_sig[i] * decay
                if i < line_len:
                    input_sample += line[idx] * feedback
                else:
                    input_sample += line[idx] * feedback

                new_line[read_idx] = input_sample
                output[i] += line[read_idx] / len(lines)

            for i in range(min(line_len, n)):
                line[i] = new_line[i]

        return output

    def process(self, y: np.ndarray) -> np.ndarray:
        """Apply shimmer reverb."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        if self.config.pre_delay > 0:
            delay_samples = int(self.config.pre_delay * self.sr / 1000.0)
            y_delayed = np.concatenate([np.zeros(delay_samples), y[:-delay_samples] if delay_samples < n else np.zeros(n - delay_samples)])
        else:
            y_delayed = y.copy()

        early_feedback = 0.5 + self.config.density * 0.4
        late_feedback = 0.7 + self.config.decay * 0.2
        early_decay = 0.8 - self.config.size * 0.3
        late_decay = 0.6 + self.config.density * 0.3

        early_out = self._diffuse(y_delayed, self._early_lines, early_feedback, early_decay)

        sos_lp = signal.butter(2, 6000 - self.config.damping * 4000, btype='low', output='sos', fs=self.sr)
        early_out = signal.sosfilt(sos_lp, early_out)

        late_out = self._diffuse(early_out, self._late_lines, late_feedback, late_decay)

        sos_lp2 = signal.butter(2, 4000 - self.config.damping * 3000, btype='low', output='sos', fs=self.sr)
        late_out = signal.sosfilt(sos_lp2, late_out)

        shimmer_out = np.zeros(n)
        for i, line in enumerate(self._shimmer_lines):
            octaves = [2.0, 3.0, 5.0, 7.0][i % 4]
            semitones = int(12.0 * np.log2(octaves))
            shifted = self._pitch_shift_simple(y_delayed, semitones)
            
            for j in range(n):
                if j < len(line):
                    shimmer_out[j] += shifted[j] * line[j] * self.config.shimmer_mix * 0.2

        combined = early_out * 0.3 + late_out * 0.5 + shimmer_out * self.config.shimmer_mix

        sos_hp = signal.butter(2, self.config.low_cut, btype='high', output='sos', fs=self.sr)
        sos_lp = signal.butter(2, self.config.high_cut, btype='low', output='sos', fs=self.sr)
        combined = signal.sosfilt(sos_hp, combined)
        combined = signal.sosfilt(sos_lp, combined)

        return (y * (1 - self.config.wet) + combined * self.config.wet).astype(np.float64)

    def _pitch_shift_simple(self, y: np.ndarray, semitones: float) -> np.ndarray:
        """Simple pitch shift for shimmer octaves."""
        from scipy import signal as sp_signal
        ratio = 2.0 ** (semitones / 12.0)
        num_samples = int(len(y) / ratio)
        return sp_signal.resample(y, num_samples)[:len(y)] if num_samples < len(y) else np.pad(sp_signal.resample(y, num_samples), (0, num_samples - len(y)))


class GatedReverb:
    """
    Classic gated reverb - triggered by signal level.
    Popular in 80s snare sounds.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._gate_envelope = 0.0
        self._gate_open = False
        self._reverb_buffer: list[np.ndarray] = []

    def _trigger_gate(self, level: float, threshold: float = 0.1) -> bool:
        """Trigger the gate based on signal level."""
        attack_coef = 0.9
        release_coef = 0.99

        if level > self._gate_envelope:
            self._gate_envelope = attack_coef * self._gate_envelope + (1 - attack_coef) * level
        else:
            self._gate_envelope = release_coef * self._gate_envelope

        if level > threshold and not self._gate_open:
            self._gate_open = True
        elif level < threshold * 0.5 and self._gate_open:
            self._gate_open = False

        return self._gate_open

    def process(self, y: np.ndarray, threshold: float = 0.1, decay: float = 3.0) -> np.ndarray:
        """Apply gated reverb."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        block_size = int(0.025 * self.sr)
        num_blocks = n // block_size

        output = np.zeros(n)

        for b in range(num_blocks):
            start = b * block_size
            end = min(start + block_size, n)
            block = y[start:end]

            rms = np.sqrt(np.mean(block ** 2))

            if self._trigger_gate(rms, threshold):
                reverb_block = self._generate_reverb_block(len(block), decay)
                output[start:end] = reverb_block * rms * 2.0

        sos_lp = signal.butter(2, 8000, btype='low', output='sos', fs=self.sr)
        sos_hp = signal.butter(2, 100, btype='high', output='sos', fs=self.sr)
        output = signal.sosfilt(sos_lp, output)
        output = signal.sosfilt(sos_hp, output)

        return (y * 0.7 + output * 0.5).astype(np.float64)

    def _generate_reverb_block(self, length: int, decay: float) -> np.ndarray:
        """Generate reverb impulse for block."""
        decay_curve = np.exp(-3.0 * np.arange(length) / length * (1.0 / max(decay, 0.1)))
        noise = np.random.randn(length)
        sos_lp = signal.butter(2, 5000, btype='low', output='sos', fs=self.sr)
        noise = signal.sosfilt(sos_lp, noise)
        return noise * decay_curve


class ReverseReverb:
    """
    Reverse reverb - builds up before the transient.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(self, y: np.ndarray, buildup_time: float = 0.5, wet: float = 0.5) -> np.ndarray:
        """Apply reverse reverb effect."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        sos_hp = signal.butter(2, 100, btype='high', output='sos', fs=self.sr)
        sos_lp = signal.butter(2, 8000, btype='low', output='sos', fs=self.sr)

        filtered = signal.sosfilt(sos_hp, y)
        filtered = signal.sosfilt(sos_lp, filtered)

        buildup_samples = int(buildup_time * self.sr)
        reverb = np.zeros(n)

        for i in range(buildup_samples, n):
            start = max(0, i - buildup_samples)
            chunk = filtered[start:i]
            if len(chunk) > 0:
                reversed_chunk = chunk[::-1]
                decay = np.linspace(1.0, 0.1, len(reversed_chunk))
                reverb[start:i] = reversed_chunk * decay * 0.5

        return (y * (1 - wet) + reverb * wet).astype(np.float64)


class FreezeReverb:
    """
    Infinite sustain reverb - freezes the sound.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._buffer: np.ndarray | None = None
        self._frozen = False
        self._position = 0

    def trigger(self, y: np.ndarray) -> None:
        """Start freezing."""
        self._buffer = np.asarray(y, dtype=np.float64).ravel().copy()
        self._position = 0
        self._frozen = True

    def process(self, length: int) -> np.ndarray:
        """Get frozen output."""
        if not self._frozen or self._buffer is None:
            return np.zeros(length)

        output = np.zeros(length)
        buf_len = len(self._buffer)

        for i in range(length):
            output[i] = self._buffer[self._position] if self._position < buf_len else 0
            self._position = (self._position + 1) % buf_len

        return output

    def release(self) -> None:
        """Stop freezing."""
        self._frozen = False


class EchoPlaneReverb:
    """
    Echo plane reverb - simulates infinite reflective plane.
    Uses image method for early reflections.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(self, y: np.ndarray, room_width: float = 10.0, room_height: float = 3.0, wall_dist: float = 5.0, wet: float = 0.4) -> np.ndarray:
        """
        Apply echo plane reverb using image method.
        """
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        c = 343.0
        sr = self.sr

        reflections = []

        for wall in range(2):
            for order in range(1, 6):
                if wall == 0:
                    delay_samples = int(2 * wall_dist / c * sr * order)
                else:
                    delay_samples = int(2 * wall_dist / c * sr * order * 0.7)

                if delay_samples > n - 1:
                    continue

                gain = 0.5 ** order
                reflection = np.zeros(n)
                reflection[delay_samples:] = y[:-delay_samples] * gain
                reflections.append(reflection)

        if not reflections:
            return y

        output = y.copy()
        for refl in reflections:
            output += refl

        sos_lp = signal.butter(2, 3000, btype='low', output='sos', fs=sr)
        output = signal.sosfilt(sos_lp, output)

        return (y * (1 - wet) + output * wet).astype(np.float64)


class AllPassReverb:
    """
    All-pass based diffuse reverb.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._allpass_lines: list[tuple[np.ndarray, int]] = []
        self._diffusion_lines: list[tuple[np.ndarray, int]] = []
        self._initialize()

    def _initialize(self) -> None:
        """Initialize all-pass and diffusion lines."""
        allpass_delays = [347, 113, 37, 59]
        diffusion_delays = [139, 163, 193, 223]

        for d in allpass_delays:
            delay_samples = int(d * self.sr / 1000.0)
            self._allpass_lines.append((np.zeros(delay_samples), 0))

        for d in diffusion_delays:
            delay_samples = int(d * self.sr / 1000.0)
            self._diffusion_lines.append((np.zeros(delay_samples), 0))

    def _process_allpass(self, input_sig: np.ndarray, buffer: np.ndarray, pos: int, gain: float = 0.7) -> tuple[np.ndarray, int]:
        """Process through all-pass filter."""
        n = len(input_sig)
        output = np.zeros(n)
        new_buffer = buffer.copy()

        for i in range(n):
            idx = pos % len(buffer)
            delayed = buffer[idx]

            output[i] = -gain * input_sig[i] + delayed
            new_idx = (idx + 1) % len(buffer)
            new_buffer[new_idx] = input_sig[i] + gain * delayed

            pos = (pos + 1) % len(buffer)

        return output, pos

    def _process_diffusion(self, input_sig: np.ndarray, buffer: np.ndarray, pos: int, gain: float = 0.7) -> tuple[np.ndarray, int]:
        """Process through diffusion network."""
        n = len(input_sig)
        output = np.zeros(n)
        new_buffer = buffer.copy()

        for i in range(n):
            idx = pos % len(buffer)
            delayed = buffer[idx]

            output[i] = delayed + gain * input_sig[i]
            new_idx = (idx + 1) % len(buffer)
            new_buffer[new_idx] = input_sig[i] + delayed * gain

            pos = (pos + 1) % len(buffer)

        return output, pos

    def process(self, y: np.ndarray, decay: float = 0.7, wet: float = 0.4) -> np.ndarray:
        """Apply all-pass reverb."""
        y = np.asarray(y, dtype=np.float64).ravel()

        for i, (buf, pos) in enumerate(self._allpass_lines):
            gain = 0.7 if i % 2 == 0 else 0.5
            processed, new_pos = self._process_allpass(y, buf, pos, gain)
            self._allpass_lines[i] = (processed, new_pos)
            y = processed

        for i, (buf, pos) in enumerate(self._diffusion_lines):
            gain = decay * (0.8 + i * 0.05)
            processed, new_pos = self._process_diffusion(y, buf, pos, gain)
            self._diffusion_lines[i] = (processed, new_pos)
            y = y * 0.3 + processed * 0.7

        sos_lp = signal.butter(2, 12000, btype='low', output='sos', fs=self.sr)
        y = signal.sosfilt(sos_lp, y)

        return y.astype(np.float64)


class ReverbFactory:
    """Factory for creating different reverb types."""

    REVERB_CLASSES = {
        ReverbType.ROOM: lambda sr: AllPassReverb(sr),
        ReverbType.HALL: lambda sr: EchoPlaneReverb(sr),
        ReverbType.PLATE: lambda sr: AllPassReverb(sr),
        ReverbType.CATHEDRAL: lambda sr: EchoPlaneReverb(sr),
        ReverbType.CHAMBER: lambda sr: AllPassReverb(sr),
        ReverbType.SHIMMER: lambda sr: ShimmerReverb(sr),
        ReverbType.GATED: lambda sr: GatedReverb(sr),
        ReverbType.REVERSE: lambda sr: ReverseReverb(sr),
        ReverbType.FREEZE: lambda sr: FreezeReverb(sr),
        ReverbType.ECHO_PLANE: lambda sr: EchoPlaneReverb(sr),
    }

    @classmethod
    def create(cls, reverb_type: ReverbType, sr: int = 48000):
        """Create a reverb instance of the specified type."""
        creator = cls.REVERB_CLASSES.get(reverb_type)
        if creator:
            return creator(sr)
        return AllPassReverb(sr)