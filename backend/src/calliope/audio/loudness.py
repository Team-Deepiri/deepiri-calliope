"""LUFS metering and loudness processing according to ITU-R BS.1770."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from calliope.mathx.db import dbfs_from_rms


def a_weighting_approx(f: np.ndarray) -> np.ndarray:
    """IEC 61672-1 A-weighting magnitude approximation (dB), for f in Hz."""
    f = np.maximum(np.asarray(f, dtype=np.float64), 1.0)
    c = 12200.0**2
    f2 = f * f
    f4 = f2 * f2
    num = c * f4
    den = (f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + c)
    ra = num / np.maximum(den, 1e-18)
    ra_unweighted = 1.2589047
    return 20.0 * np.log10(np.maximum(ra / ra_unweighted, 1e-18))


def weighted_rms_db(y: np.ndarray, sr: int, n_fft: int = 1024) -> float:
    """Single broadband A-weighted-ish level from first frame spectrum (coarse)."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size < n_fft:
        y = np.pad(y, (0, n_fft - y.size))
    win = np.hanning(n_fft)
    frame = y[:n_fft] * win
    mag = np.abs(np.fft.rfft(frame, n=n_fft))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    w = a_weighting_approx(freqs)
    weighted = mag * (10 ** (w / 40.0))
    rms = float(np.sqrt(np.mean(weighted**2) + 1e-18))
    return float(dbfs_from_rms(rms))


@dataclass
class LoudnessConfig:
    target_lufs: float = -14.0
    target_true_peak: float = -1.0
    max_gain_db: float = 20.0
    max_gain_reduction_db: float = 24.0
    limiter_threshold_db: float = -0.5
    release_ms: float = 100.0


class LUFSMeter:
    """ITU-R BS.1770-4 compliant loudness meter."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        
        self._k_weighting = self._create_k_weighting(sr)
        self._integrated = 0.0
        self._integrated_sum = 0.0
        self._integrated_samples = 0
        self._short_term_history: list[float] = []
        self._momentary_history: list[float] = []
        self._gated_integrated = -70.0
        self._prev_gated = -70.0

    def _create_k_weighting(self, sr: int) -> np.ndarray:
        from scipy import signal
        sos_high = signal.butter(2, 38.0, btype='high', output='sos', fs=sr)
        return sos_high

    def _k_weight(self, samples: np.ndarray) -> np.ndarray:
        from scipy import signal
        return signal.sosfilt(self._k_weighting, samples)

    def _block_loudness(self, samples: np.ndarray) -> float:
        if len(samples) == 0:
            return -70.0
        weighted = self._k_weight(samples)
        power = np.mean(weighted ** 2)
        if power < 1e-10:
            return -70.0
        return -0.691 + 10.0 * np.log10(power)

    def update(self, samples: np.ndarray) -> dict:
        samples = np.asarray(samples, dtype=np.float64).ravel()
        block_size = int(0.4 * self.sr)
        hop_size = int(0.1 * self.sr)
        
        for i in range(0, len(samples) - block_size, hop_size):
            block = samples[i:i + block_size]
            loudness = self._block_loudness(block)
            
            self._short_term_history.append(loudness)
            if len(self._short_term_history) > 60:
                self._short_term_history.pop(0)
            
            momentary_block_size = int(0.025 * self.sr)
            for j in range(0, len(block) - momentary_block_size, momentary_block_size // 4):
                m_block = block[j:j + momentary_block_size]
                m_loudness = self._block_loudness(m_block)
                self._momentary_history.append(m_loudness)
                if len(self._momentary_history) > 400:
                    self._momentary_history.pop(0)
            
            if self._gated_integrated > -70.0:
                if loudness >= self._gated_integrated - 10.0:
                    self._integrated_sum += 10 ** (loudness / 10.0)
                    self._integrated_samples += 1
            
            if loudness > self._prev_gated - 10.0:
                self._prev_gated = loudness
        
        short_term = max(self._short_term_history[-3:]) if len(self._short_term_history) >= 3 else -70.0
        momentary = self._momentary_history[-1] if self._momentary_history else -70.0
        
        if self._integrated_samples > 0:
            self._integrated = -0.691 + 10.0 * np.log10(self._integrated_sum / self._integrated_samples)
        else:
            self._integrated = -70.0
        
        self._gated_integrated = self._compute_gated()
        return self.get_readings()

    def _compute_gated(self) -> float:
        if not self._short_term_history:
            return -70.0
        valid_blocks = [s for s in self._short_term_history if s > -70.0]
        if not valid_blocks:
            return -70.0
        ungated_avg = np.mean(valid_blocks)
        absolute_gate = -70.0 + 10.0
        gated_blocks = [s for s in valid_blocks if s > absolute_gate]
        if not gated_blocks:
            return -70.0
        relative_gate = np.mean(gated_blocks) - 10.0
        final_blocks = [s for s in valid_blocks if s > relative_gate]
        if not final_blocks:
            return -70.0
        return -0.691 + 10.0 * np.log10(np.mean([10 ** (s / 10.0) for s in final_blocks]))

    def get_readings(self) -> dict:
        short_term = max(self._short_term_history[-3:]) if len(self._short_term_history) >= 3 else -70.0
        momentary = self._momentary_history[-1] if self._momentary_history else -70.0
        return {
            "integrated_lufs": round(self._integrated, 1),
            "short_term_lufs": round(short_term, 1),
            "momentary_lufs": round(momentary, 1),
            "gated_lufs": round(self._gated_integrated, 1),
            "range_lufs": round(max(self._short_term_history) - min([s for s in self._short_term_history if s > -70]), 1) if self._short_term_history else 0.0,
        }

    def reset(self) -> None:
        self._integrated = 0.0
        self._integrated_sum = 0.0
        self._integrated_samples = 0
        self._short_term_history.clear()
        self._momentary_history.clear()
        self._gated_integrated = -70.0
        self._prev_gated = -70.0


class LoudnessNormalizer:
    """Loudness normalizer using LUFS measurements."""

    def __init__(self, sr: int = 48000, config: LoudnessConfig | None = None):
        self.sr = sr
        self.config = config or LoudnessConfig()
        self.meter = LUFSMeter(sr)

    def analyze(self, samples: np.ndarray) -> dict:
        return self.meter.update(samples)

    def normalize(self, samples: np.ndarray) -> tuple[np.ndarray, dict]:
        samples = np.asarray(samples, dtype=np.float64).ravel()
        self.meter.reset()
        initial_readings = self.meter.update(samples)
        initial_lufs = initial_readings["integrated_lufs"]
        
        if initial_lufs < -69.0:
            return samples, {"gain_db": 0.0, "lufs_before": initial_lufs, "lufs_after": initial_lufs}
        
        gain_db = self.config.target_lufs - initial_lufs
        gain_db = max(-self.config.max_gain_reduction_db, min(self.config.max_gain_db, gain_db))
        gain_linear = 10 ** (gain_db / 20.0)
        normalized = samples * gain_linear
        
        peak = float(np.max(np.abs(normalized)))
        true_peak_db = -60.0 if peak < 1e-6 else 20.0 * np.log10(peak)
        
        if true_peak_db > self.config.limiter_threshold_db:
            if self.config.target_true_peak < true_peak_db:
                limit_gain = self.config.target_true_peak - true_peak_db
                normalized = normalized * (10 ** (limit_gain / 20.0))
                gain_db += limit_gain
        
        return normalized.astype(np.float64), {
            "gain_db": round(gain_db, 2),
            "lufs_before": round(initial_lufs, 1),
            "lufs_after": round(self.meter.update(normalized)["integrated_lufs"], 1),
        }


def true_peak_detector(samples: np.ndarray, sr: int, oversample: int = 4) -> float:
    from scipy import signal
    if oversample > 1:
        resampled = signal.resample_poly(samples, oversample, 1)
    else:
        resampled = samples
    peak = float(np.max(np.abs(resampled)))
    peak_db = -60.0 if peak < 1e-6 else 20.0 * np.log10(peak)
    return peak_db


def measure_lufs(samples: np.ndarray, sr: int = 48000) -> float:
    """Convenience function: measure integrated LUFS of audio array."""
    meter = LUFSMeter(sr)
    readings = meter.update(samples)
    return readings["integrated_lufs"]


class DynamicRangeMeter:
    """Measure dynamic range (DR) for mastering."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._rms_history: list[float] = []

    def update(self, samples: np.ndarray) -> dict:
        rms = np.sqrt(np.mean(samples ** 2))
        rms_db = -60.0 if rms < 1e-6 else 20.0 * np.log10(rms)
        self._rms_history.append(rms_db)
        
        sorted_rms = sorted(self._rms_history)
        if len(sorted_rms) >= 20:
            top_20 = sorted_rms[int(len(sorted_rms) * 0.8):]
            high_rms_db = np.mean(top_20)
            bottom_20 = sorted_rms[:int(len(sorted_rms) * 0.2)]
            low_rms_db = np.mean(bottom_20)
        else:
            high_rms_db = max(self._rms_history) if self._rms_history else -60.0
            low_rms_db = min(self._rms_history) if self._rms_history else -60.0
        
        dr = high_rms_db - low_rms_db
        return {
            "dr_rating": round(dr),
            "high_rms_db": round(high_rms_db, 1),
            "low_rms_db": round(low_rms_db, 1),
            "instant_rms_db": round(rms_db, 1),
        }

    def reset(self) -> None:
        self._rms_history.clear()