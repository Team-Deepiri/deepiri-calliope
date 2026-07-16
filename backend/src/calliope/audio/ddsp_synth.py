"""Differentiable digital signal processing (DDSP) synthesis.

Harmonic oscillator, filtered noise, and reverb components
for neural audio synthesis with frequency/amplitude envelope control.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Any
from scipy import signal as scipy_signal


@dataclass
class DDSPConfig:
    sample_rate: int = 48000
    block_size: int = 64
    n_harmonics: int = 100
    n_noise_bins: int = 65
    reverb_decay: float = 0.5
    reverb_length: float = 0.1
    f0_min: float = 32.7
    f0_max: float = 2093.0


class HarmonicOscillator:
    """Harmonic oscillator summing sine waves with learned amplitudes."""

    def __init__(self, config: DDSPConfig):
        self.config = config
        self.phase: float = 0.0

    def synthesize(
        self, f0: np.ndarray, amplitudes: np.ndarray,
    ) -> np.ndarray:
        """Synthesize harmonic signal from fundamental frequency and harmonic amplitudes.

        Args:
            f0: (batch, n_frames) fundamental frequency in Hz.
            amplitudes: (batch, n_frames, n_harmonics) harmonic amplitudes.

        Returns:
            (batch, n_samples) audio signal.
        """
        batch, n_frames = f0.shape
        n_harmonics = amplitudes.shape[-1]
        block_size = self.config.block_size
        n_samples = n_frames * block_size

        f0_interp = np.repeat(f0, block_size, axis=-1)[:, :n_samples]
        amps_interp = np.repeat(amplitudes, block_size, axis=1)[:, :n_samples, :]

        cum_phase = np.cumsum(2.0 * np.pi * f0_interp / self.config.sample_rate, axis=-1)
        cum_phase = cum_phase + self.phase
        self.phase = float(cum_phase[0, -1] % (2.0 * np.pi))

        harmonics = np.arange(1, n_harmonics + 1, dtype=np.float32)
        harmonic_phases = cum_phase[:, :, np.newaxis] * harmonics[np.newaxis, np.newaxis, :]

        signal = np.sum(amps_interp * np.sin(harmonic_phases), axis=-1)
        return signal

    def reset(self) -> None:
        self.phase = 0.0


class FilteredNoise:
    """Filtered noise component for non-harmonic sounds."""

    def __init__(self, config: DDSPConfig):
        self.config = config
        self.noise_buf: np.ndarray | None = None

    def synthesize(self, magnitudes: np.ndarray) -> np.ndarray:
        """Synthesize filtered noise from magnitude envelope.

        Args:
            magnitudes: (batch, n_frames, n_noise_bins) noise magnitudes per frequency bin.

        Returns:
            (batch, n_samples) filtered noise signal.
        """
        batch, n_frames, n_bins = magnitudes.shape
        block_size = self.config.block_size
        n_samples = n_frames * block_size

        noise = np.random.randn(batch, n_samples).astype(np.float32)
        noise = noise * 0.1

        mags_interp = np.repeat(magnitudes, block_size, axis=1)[:, :n_samples, :]

        freqs = np.linspace(0, self.config.sample_rate / 2, n_bins, dtype=np.float32)
        sos = scipy_signal.butter(4, freqs[-1] / (self.config.sample_rate / 2), btype="low", output="sos")

        filtered = np.zeros_like(noise)
        for b in range(batch):
            env = mags_interp[b].mean(axis=-1)
            filtered[b] = scipy_signal.sosfilt(sos, noise[b] * env)

        peak = np.max(np.abs(filtered))
        if peak > 1e-8:
            filtered = filtered / peak * 0.3

        return filtered


class Reverb:
    """Simple reverberation using feedback delay network."""

    def __init__(self, config: DDSPConfig):
        self.config = config
        self._build_delays()

    def _build_delays(self) -> None:
        n_delays = 8
        base = int(self.config.reverb_length * self.config.sample_rate)
        offsets = np.linspace(0, base * 0.3, n_delays).astype(int)
        self.delays = np.clip(base + offsets, 10, self.config.sample_rate)
        self.feedback = np.ones(n_delays, dtype=np.float32) * self.config.reverb_decay / n_delays
        self.state = [np.zeros(d, dtype=np.float32) for d in self.delays]

    def apply(self, signal: np.ndarray, wet: float = 0.3, dry: float = 0.7) -> np.ndarray:
        """Apply reverb via parallel comb filters.

        Args:
            signal: (n_samples,) mono audio input.
            wet: wet mix level.
            dry: dry mix level.

        Returns:
            (n_samples,) reverberated audio.
        """
        out = np.zeros_like(signal)

        for i, (delay, fb) in enumerate(zip(self.delays, self.feedback)):
            buf = self.state[i]
            delayed = np.zeros_like(signal)
            n = len(buf)

            for t in range(len(signal)):
                idx = t % n
                delayed[t] = buf[idx]
                buf[idx] = signal[t] + fb * buf[idx]

            self.state[i] = buf
            out += delayed

        peak = np.max(np.abs(out))
        if peak > 1e-8:
            out = out / peak * wet

        return dry * signal + wet * out

    def reset(self) -> None:
        self.state = [np.zeros(d, dtype=np.float32) for d in self.delays]


class DDSP:
    """Differentiable DSP synthesizer combining harmonic + noise + reverb."""

    def __init__(self, config: DDSPConfig | None = None):
        self.config = config or DDSPConfig()
        self.harmonic_osc = HarmonicOscillator(self.config)
        self.filtered_noise = FilteredNoise(self.config)
        self.reverb_unit = Reverb(self.config)

    def harmonic_synth(self, f0: np.ndarray, amplitudes: np.ndarray) -> np.ndarray:
        """Synthesize harmonic component only."""
        return self.harmonic_osc.synthesize(f0, amplitudes)

    def noise_synth(self, magnitudes: np.ndarray) -> np.ndarray:
        """Synthesize noise component only."""
        return self.filtered_noise.synthesize(magnitudes)

    def synthesize(
        self,
        f0: np.ndarray,
        harmonic_amps: np.ndarray,
        noise_mags: np.ndarray,
        reverb_wet: float = 0.3,
    ) -> np.ndarray:
        """Full synthesis combining harmonic, noise, and reverb.

        Args:
            f0: (batch, n_frames) fundamental frequency contour.
            harmonic_amps: (batch, n_frames, n_harmonics) harmonic amplitudes.
            noise_mags: (batch, n_frames, n_noise_bins) noise magnitudes.
            reverb_wet: wet/dry mix for reverb (0-1).

        Returns:
            (batch, n_samples) synthesized audio.
        """
        batch = f0.shape[0]
        harmonic = self.harmonic_synth(f0, harmonic_amps)
        noise = self.noise_synth(noise_mags)

        mixed = harmonic + noise
        peak = np.max(np.abs(mixed))
        if peak > 1e-8:
            mixed = mixed / peak

        output = np.zeros_like(mixed)
        for b in range(batch):
            output[b] = self.reverb_unit.apply(mixed[b], wet=reverb_wet)

        return output

    def synthesize_from_envelopes(
        self,
        f0_contour: np.ndarray,
        amp_envelope: np.ndarray,
        noise_envelope: np.ndarray,
    ) -> np.ndarray:
        """Synthesize from frequency and amplitude envelopes.

        Args:
            f0_contour: (n_frames,) fundamental frequency in Hz.
            amp_envelope: (n_frames,) amplitude scaling per frame.
            noise_envelope: (n_frames,) noise level per frame.

        Returns:
            (n_samples,) synthesized mono audio.
        """
        n_frames = len(f0_contour)
        f0 = f0_contour[np.newaxis, :]
        amps = np.ones((1, n_frames, self.config.n_harmonics), dtype=np.float32)
        decay = np.exp(-np.arange(self.config.n_harmonics, dtype=np.float32) * 0.1)
        amps = amps * amp_envelope[np.newaxis, :, np.newaxis] * decay[np.newaxis, np.newaxis, :]

        n_bins = self.config.n_noise_bins
        noise = np.ones((1, n_frames, n_bins), dtype=np.float32) * \
                noise_envelope[np.newaxis, :, np.newaxis]

        return self.synthesize(f0, amps, noise)

    def reset(self) -> None:
        self.harmonic_osc.reset()
        self.reverb_unit.reset()
