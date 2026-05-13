"""Advanced dynamics processor with sidechain and parallel compression."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Literal


@dataclass
class CompressorConfig:
    threshold_db: float = -20.0
    ratio: float = 4.0
    attack_ms: float = 10.0
    release_ms: float = 100.0
    knee_db: float = 6.0
    makeup_gain_db: float = 0.0
    mix: float = 1.0
    sidechain_freq_hz: float = 0.0
    sidechain_q: float = 1.0


class DynamicsProcessor:
    """Advanced dynamics processor with multiple modes."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.envelope = 0.0
        self.gr_db = 0.0

    def soft_knee_compression(
        self,
        samples: np.ndarray,
        threshold_db: float,
        ratio: float,
        attack_coef: float,
        release_coef: float,
        knee_db: float = 6.0,
    ) -> tuple[np.ndarray, np.ndarray]:
        threshold_linear = 10 ** (threshold_db / 20)

        input_rms = np.sqrt(np.mean(samples ** 2))
        input_db = 20 * np.log10(input_rms + 1e-10)

        output = samples.copy()
        gain_reduction = np.ones_like(samples)

        for i in range(len(samples)):
            sample_abs = abs(samples[i])

            if sample_abs < threshold_linear * 10 ** (-knee_db / 40):
                knee_start = threshold_linear * 10 ** (-knee_db / 40)
                knee_end = threshold_linear * 10 ** (knee_db / 40)

                if sample_abs < knee_end:
                    x = 20 * np.log10(sample_abs + 1e-10)
                    knee_center = threshold_db
                    knee_width = knee_db

                    above = x - knee_center + knee_width / 2

                    if above < 0:
                        above = 0
                    elif above > knee_width:
                        above = knee_width

                    compression_ratio = ratio - (ratio - 1) * (above / knee_width) ** 2

                    if x > threshold_db - knee_db / 2:
                        compressed_db = threshold_db + (x - threshold_db) / compression_ratio
                        gr = compressed_db - x
                    else:
                        gr = 0
                else:
                    x = 20 * np.log10(sample_abs + 1e-10)
                    compressed_db = threshold_db + (x - threshold_db) / ratio
                    gr = compressed_db - x
            else:
                x = 20 * np.log10(sample_abs + 1e-10)
                compressed_db = threshold_db + (x - threshold_db) / ratio
                gr = compressed_db - x

            gr_linear = 10 ** (gr / 20)
            gain_reduction[i] = gr_linear

            if gr < self.envelope:
                self.envelope = attack_coef * self.envelope + (1 - attack_coef) * gr
            else:
                self.envelope = release_coef * self.envelope + (1 - release_coef) * gr

            output[i] = samples[i] * self.envelope

        return output, gain_reduction

    def transparent_compression(
        self,
        samples: np.ndarray,
        threshold_db: float,
        ratio: float,
        attack_ms: float,
        release_ms: float,
    ) -> tuple[np.ndarray, np.ndarray]:
        attack_coef = np.exp(-1.0 / (attack_ms * self.sr / 1000))
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000))

        threshold_linear = 10 ** (threshold_db / 20)

        envelope = np.zeros_like(samples)
        gain = np.ones_like(samples)

        for i in range(len(samples)):
            level = abs(samples[i])

            if level > envelope[i - 1] if i > 0 else True:
                coef = attack_coef
            else:
                coef = release_coef

            envelope[i] = coef * envelope[i - 1] + (1 - coef) * level if i > 0 else level

            if envelope[i] > threshold_linear:
                gr = (threshold_linear + (envelope[i] - threshold_linear) / ratio) / (envelope[i] + 1e-10)
            else:
                gr = 1.0

            gain[i] = gr

        gain_db = 20 * np.log10(gain + 1e-10)
        self.gr_db = np.mean(gain_db)

        return samples * gain, gain

    def buss_compression(
        self,
        samples: np.ndarray,
        threshold_db: float = -18,
        ratio: float = 3.0,
        attack_ms: float = 5.0,
        release_ms: float = 50.0,
        blend: float = 1.0,
    ) -> np.ndarray:
        from scipy.signal import butter, lfilter

        nyq = self.sr / 2

        if len(samples.shape) == 2:
            left = samples[:, 0]
            right = samples[:, 1]
        else:
            left = right = samples

        rms_left = np.sqrt(np.mean(left ** 2))
        rms_right = np.sqrt(np.mean(right ** 2))

        max_rms = max(rms_left, rms_right)

        threshold_linear = 10 ** (threshold_db / 20)

        if max_rms > threshold_linear:
            compressed_amount = (max_rms - threshold_linear) / ratio
            compressed_rms = threshold_linear + compressed_amount

            if blend < 1.0:
                target_rms = max_rms * blend + compressed_rms * (1 - blend)
            else:
                target_rms = compressed_rms

            gain = target_rms / max_rms

            left_out = left * gain
            right_out = right * gain

            if len(samples.shape) == 2:
                return np.stack([left_out, right_out], axis=1)
            return left_out

        return samples


class SidechainProcessor:
    """Sidechain compression with external input support."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = CompressorConfig()

    def duck(
        self,
        samples: np.ndarray,
        trigger: np.ndarray,
        amount_db: float = 10.0,
        attack_ms: float = 5.0,
        release_ms: float = 100.0,
    ) -> np.ndarray:
        amount_linear = 10 ** (-amount_db / 20)

        attack_coef = np.exp(-1.0 / (attack_ms * self.sr / 1000))
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000))

        envelope = np.zeros_like(trigger)

        for i in range(len(trigger)):
            level = abs(trigger[i])

            if level > envelope[i - 1] if i > 0 else True:
                coef = attack_coef
            else:
                coef = release_coef

            envelope[i] = coef * envelope[i - 1] + (1 - coef) * level if i > 0 else level

        max_env = np.max(envelope)
        if max_env > 0:
            envelope = envelope / max_env

        gain = np.ones_like(samples) * (1 - amount_linear) + envelope * amount_linear

        return samples * gain

    def pump(
        self,
        samples: np.ndarray,
        trigger: np.ndarray,
        threshold_db: float = -20,
        ratio: float = 4.0,
        attack_ms: float = 1.0,
        release_ms: float = 50.0,
    ) -> np.ndarray:
        threshold_linear = 10 ** (threshold_db / 20)

        attack_coef = np.exp(-1.0 / (attack_ms * self.sr / 1000))
        release_coef = np.exp(-1.0 / (release_ms * self.sr / 1000))

        envelope = np.zeros_like(trigger)

        for i in range(len(trigger)):
            level = abs(trigger[i])

            if level > envelope[i - 1] if i > 0 else True:
                coef = attack_coef
            else:
                coef = release_coef

            envelope[i] = coef * envelope[i - 1] + (1 - coef) * level if i > 0 else level

        gain = np.ones_like(samples)

        for i in range(len(samples)):
            if envelope[i] > threshold_linear:
                gr = (threshold_linear + (envelope[i] - threshold_linear) / ratio) / (envelope[i] + 1e-10)
            else:
                gr = 1.0

            gain[i] = gr

        return samples * gain

    def sidechain_filter(
        self,
        samples: np.ndarray,
        freq_hz: float = 200.0,
        q: float = 1.0,
    ) -> np.ndarray:
        from scipy.signal import butter, lfilter

        nyq = self.sr / 2
        cutoff = min(freq_hz / nyq, 0.99)

        b, a = butter(2, cutoff, btype="low")
        filtered = lfilter(b, a, samples)

        return filtered


class ParallelCompressor:
    """Parallel compression for transparent dynamics control."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.dry = np.array([])
        self.wet = np.array([])

    def mix(
        self,
        samples: np.ndarray,
        compressed: np.ndarray,
        blend: float = 0.5,
    ) -> np.ndarray:
        return (1 - blend) * samples + blend * compressed


def apply_compression(
    samples: np.ndarray,
    sr: int,
    threshold_db: float = -20,
    ratio: float = 4.0,
    attack_ms: float = 10.0,
    release_ms: float = 100.0,
    makeup_db: float = 0.0,
    mix: float = 1.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Apply compression with gain reduction output."""
    processor = DynamicsProcessor(sr)

    threshold_linear = 10 ** (threshold_db / 20)

    rms = np.sqrt(np.mean(samples ** 2))
    input_db = 20 * np.log10(rms + 1e-10)

    attack_coef = np.exp(-1.0 / (attack_ms * sr / 1000))
    release_coef = np.exp(-1.0 / (release_ms * sr / 1000))

    envelope = np.zeros_like(samples)
    gain = np.ones_like(samples)

    for i in range(len(samples)):
        level = abs(samples[i])

        if level > envelope[i - 1] if i > 0 else True:
            coef = attack_coef
        else:
            coef = release_coef

        envelope[i] = coef * envelope[i - 1] + (1 - coef) * level if i > 0 else level

        if envelope[i] > threshold_linear:
            gr = (threshold_linear + (envelope[i] - threshold_linear) / ratio) / (envelope[i] + 1e-10)
        else:
            gr = 1.0

        gain[i] = gr

    compressed = samples * gain

    if makeup_db > 0:
        makeup = 10 ** (makeup_db / 20)
        compressed = compressed * makeup

    if mix < 1.0:
        output = (1 - mix) * samples + mix * compressed
    else:
        output = compressed

    return output, gain