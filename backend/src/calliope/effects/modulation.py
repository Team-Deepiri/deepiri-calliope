"""Vocoder, ring modulator, and spectral modulation effects."""

from __future__ import annotations

import numpy as np
from scipy import signal


class Vocoder:
    """
    Classic vocoder - analyzes carrier with modulator envelope.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._num_bands = 16
        self._build_filters()

    def _build_filters(self) -> None:
        """Build filter bank for vocoder."""
        nyq = self.sr / 2
        self._filters = []

        for i in range(self._num_bands):
            low = (nyq / self._num_bands) * i * 0.5
            high = (nyq / self._num_bands) * (i + 1) * 2

            low = max(20, min(low, nyq - 100))
            high = max(low + 50, min(high, nyq))

            sos = signal.butter(4, [low, high], btype='band', output='sos', fs=self.sr)
            self._filters.append(sos)

    def process(self, carrier: np.ndarray, modulator: np.ndarray, voiced: bool = True) -> np.ndarray:
        """Process carrier through modulator envelope."""
        carrier = np.asarray(carrier, dtype=np.float64).ravel()
        modulator = np.asarray(modulator, dtype=np.float64).ravel()

        if len(modulator) > len(carrier):
            modulator = modulator[:len(carrier)]
        elif len(modulator) < len(carrier):
            modulator = np.pad(modulator, (0, len(carrier) - len(modulator)))

        output = np.zeros(len(carrier))

        for sos in self._filters:
            carrier_band = signal.sosfilt(sos, carrier)
            mod_band = signal.sosfilt(sos, modulator)

            env = np.abs(signal.hilbert(mod_band))

            sos_lp = signal.butter(2, 200, btype='low', output='sos', fs=self.sr)
            env = signal.sosfilt(sos_lp, env)

            vocoded_band = carrier_band * env

            output += vocoded_band / self._num_bands

        if voiced:
            phase = np.angle(signal.hilbert(carrier))
            output = output * np.cos(phase)

        return output.astype(np.float64)


class RingModulator:
    """
    Ring modulator - simple carrier * modulator.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(self, carrier: np.ndarray, modulator: np.ndarray) -> np.ndarray:
        """Apply ring modulation."""
        carrier = np.asarray(carrier, dtype=np.float64).ravel()
        modulator = np.asarray(modulator, dtype=np.float64).ravel()

        min_len = min(len(carrier), len(modulator))
        carrier = carrier[:min_len]
        modulator = modulator[:min_len]

        return (carrier * modulator).astype(np.float64)

    def process_with_carrier(
        self,
        modulator: np.ndarray,
        carrier_freq: float = 440.0,
        carrier_type: str = "sine",
    ) -> np.ndarray:
        """Process with generated carrier."""
        modulator = np.asarray(modulator, dtype=np.float64).ravel()
        n = len(modulator)
        t = np.arange(n, dtype=np.float64) / self.sr

        if carrier_type == "sine":
            carrier = np.sin(2 * np.pi * carrier_freq * t)
        elif carrier_type == "square":
            carrier = np.sign(np.sin(2 * np.pi * carrier_freq * t))
        elif carrier_type == "saw":
            carrier = 2 * (t * carrier_freq % 1) - 1
        elif carrier_type == "noise":
            carrier = np.random.randn(n)
        else:
            carrier = np.sin(2 * np.pi * carrier_freq * t)

        return (modulator * carrier).astype(np.float64)


class AMModulator:
    """
    Amplitude modulation with adjustable depth.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def process(
        self,
        y: np.ndarray,
        mod_freq: float = 4.0,
        depth: float = 1.0,
    ) -> np.ndarray:
        """Apply AM with given frequency and depth."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)
        t = np.arange(n, dtype=np.float64) / self.sr

        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * mod_freq * t)

        mod = 1.0 - depth * (1.0 - lfo)

        return (y * mod).astype(np.float64)


class DimensionalModulator:
    """
    4-stage dimension chorus - for lush stereo widening.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._delays = [int(d * sr / 1000) for d in [5.0, 7.0, 11.0, 13.0]]
        self._phases = [0.0] * 4

    def process(self, y: np.ndarray, rate: float = 0.2, depth: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
        """Apply dimensional modulation to produce stereo."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        left = np.zeros(n)
        right = np.zeros(n)

        for i in range(n):
            for j, delay in enumerate(self._delays):
                phase = self._phases[j]
                mod = np.sin(2 * np.pi * rate * i / self.sr + phase) * depth * delay * 0.1
                actual_delay = max(1, int(delay + mod))

                idx = i - actual_delay
                if idx >= 0 and idx < n:
                    left[i] += y[idx] * (0.7 + 0.3 * np.cos(phase))
                    right[i] += y[idx] * (0.7 + 0.3 * np.sin(phase))

        left = left / len(self._delays)
        right = right / len(self._delays)

        for j in range(len(self._delays)):
            self._phases[j] += 2 * np.pi * rate / self.sr
            if self._phases[j] > 2 * np.pi:
                self._phases[j] -= 2 * np.pi

        return left.astype(np.float64), right.astype(np.float64)


class Flanger:
    """
    Flanger effect with feedback.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._buffer = np.zeros(int(0.02 * sr))
        self._write_pos = 0
        self._phase = 0.0

    def process(self, y: np.ndarray, rate: float = 0.5, depth: float = 0.7, feedback: float = 0.5) -> np.ndarray:
        """Apply flanging."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)
        output = np.zeros(n)
        buffer = self._buffer.copy()
        phase = self._phase

        base_delay = int(0.001 * self.sr)
        max_mod = int(0.008 * self.sr)

        for i in range(n):
            lfo = np.sin(2 * np.pi * phase)
            delay = base_delay + int(max_mod * depth * (lfo * 0.5 + 0.5))

            read_pos = (self._write_pos - delay) % len(buffer)

            delayed = buffer[read_pos]
            output[i] = y[i] + delayed

            buffer[self._write_pos] = y[i] + delayed * feedback

            self._write_pos = (self._write_pos + 1) % len(buffer)
            phase += rate / self.sr
            if phase >= 1.0:
                phase -= 1.0

        self._buffer = buffer
        self._phase = phase

        return output.astype(np.float64)


class Phaser:
    """
    Phaser effect using allpass filters.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._phase = 0.0
        self._filters_state = [0.0] * 12

    def _allpass(self, x: float, freq: float, q: float = 0.7) -> float:
        """Single allpass stage."""
        w = 2 * np.pi * freq / self.sr
        cos_w = np.cos(w)
        sin_w = np.sin(w)
        alpha = sin_w / (2 * q)

        b0 = 1 - alpha
        b1 = -2 * cos_w
        b2 = 1 + alpha
        a0 = 1 + alpha
        a1 = -2 * cos_w
        a2 = 1 - alpha

        y = (b0 / a0) * x + (b1 / a0) * self._filters_state[0] + (b2 / a0) * self._filters_state[1] - (a1 / a0) * self._filters_state[2] - (a2 / a0) * self._filters_state[3]

        self._filters_state[1] = self._filters_state[0]
        self._filters_state[0] = x
        self._filters_state[3] = self._filters_state[2]
        self._filters_state[2] = y

        return y

    def process(self, y: np.ndarray, rate: float = 0.3, depth: float = 0.7, stages: int = 4, feedback: float = 0.5) -> np.ndarray:
        """Apply phasing."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)
        output = np.zeros(n)
        phase = self._phase

        for i in range(n):
            base_freq = 200.0 + depth * 4000.0
            freq = base_freq * (1.0 + 0.5 * np.sin(2 * np.pi * phase))

            sample = y[i] + self._filters_state[-2] * feedback

            for _ in range(stages):
                sample = self._allpass(sample, freq, q=0.8)

            output[i] = sample * 0.5 + y[i] * 0.5

            phase += rate / self.sr
            if phase >= 1.0:
                phase -= 1.0

        self._phase = phase
        return output.astype(np.float64)


class Tremolo:
    """
    Tremolo with multiple waveforms.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._phase = 0.0

    def process(self, y: np.ndarray, rate: float = 4.0, depth: float = 0.8, waveform: str = "sine") -> np.ndarray:
        """Apply tremolo."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)
        t = np.arange(n, dtype=np.float64) / self.sr
        phase = self._phase

        t_shifted = t + phase / rate

        if waveform == "sine":
            lfo = np.sin(2 * np.pi * rate * t_shifted)
        elif waveform == "square":
            lfo = np.sign(np.sin(2 * np.pi * rate * t_shifted))
        elif waveform == "triangle":
            lfo = 2 * np.abs(2 * (t_shifted * rate % 1) - 1) - 1
        elif waveform == "sawtooth":
            lfo = 2 * (t_shifted * rate % 1) - 1
        else:
            lfo = np.sin(2 * np.pi * rate * t_shifted)

        mod = 1.0 - depth * (lfo * 0.5 + 0.5)

        self._phase = (rate / self.sr * n) % 1.0

        return (y * mod).astype(np.float64)


class Chorus:
    """
    Stereo chorus effect.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._buffer_l = np.zeros(int(0.05 * sr))
        self._buffer_r = np.zeros(int(0.05 * sr))
        self._write_pos = 0
        self._phase_l = 0.0
        self._phase_r = np.pi

    def process(self, y: np.ndarray, rate: float = 0.5, depth: float = 0.6, spread: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
        """Apply chorus to produce stereo."""
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)

        left = np.zeros(n)
        right = np.zeros(n)

        buffer_l = self._buffer_l.copy()
        buffer_r = self._buffer_r.copy()
        write_pos = self._write_pos
        phase_l = self._phase_l
        phase_r = self._phase_r

        base_delay = int(0.015 * self.sr)
        max_mod = int(0.01 * self.sr)

        for i in range(n):
            lfo_l = np.sin(2 * np.pi * phase_l)
            lfo_r = np.sin(2 * np.pi * phase_r)

            delay_l = base_delay + int(max_mod * depth * (lfo_l * 0.5 + 0.5))
            delay_r = base_delay + int(max_mod * depth * (lfo_r * 0.5 + 0.5))

            read_l = (write_pos - delay_l) % len(buffer_l)
            read_r = (write_pos - delay_r) % len(buffer_r)

            left[i] = buffer_l[read_l] * spread + y[i] * (1 - spread)
            right[i] = buffer_r[read_r] * spread + y[i] * (1 - spread)

            buffer_l[write_pos] = y[i] + buffer_r[read_r] * 0.2
            buffer_r[write_pos] = y[i] + buffer_l[read_l] * 0.2

            write_pos = (write_pos + 1) % len(buffer_l)

            phase_l += rate / self.sr
            phase_r += rate / self.sr
            if phase_l >= 1.0:
                phase_l -= 1.0
            if phase_r >= 1.0:
                phase_r -= 1.0

        self._buffer_l = buffer_l
        self._buffer_r = buffer_r
        self._write_pos = write_pos
        self._phase_l = phase_l
        self._phase_r = phase_r

        return left.astype(np.float64), right.astype(np.float64)