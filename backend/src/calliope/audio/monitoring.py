"""Real-time audio monitoring dashboard with advanced meters."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Callable


@dataclass
class MeterConfig:
    peak_hold: float = 2.0
    decay_rate: float = 20.0
    segement_count: int = 12
    green_threshold: float = -18.0
    yellow_threshold: float = -9.0
    red_threshold: float = -3.0


class LevelMeter:
    """Professional audio level meter with peak hold."""

    def __init__(self, config: MeterConfig | None = None, sr: int = 48000):
        self.config = config or MeterConfig()
        self.sr = sr
        self.peak = -60.0
        self.peak_hold_time = 0
        self.peak_hold_max = int(self.config.peak_hold * sr / 512)
        self.current_level = -60.0

    def process(self, samples: np.ndarray) -> dict:
        rms = 20 * np.log10(np.sqrt(np.mean(samples ** 2)) + 1e-10)
        self.current_level = rms

        peak_sample = 20 * np.log10(np.max(np.abs(samples)) + 1e-10)

        if peak_sample > self.peak:
            self.peak = peak_sample
            self.peak_hold_time = 0
        else:
            self.peak_hold_time += 1
            if self.peak_hold_time > self.peak_hold_max:
                self.peak = max(self.peak - self.config.decay_rate / self.sr * 512, rms)

        segments = []
        for i in range(self.config.segement_count):
            threshold = self.config.green_threshold + (i / self.config.segement_count) * (0 - self.config.green_threshold)
            if self.current_level >= threshold:
                if threshold >= self.config.red_threshold:
                    segments.append("red")
                elif threshold >= self.config.yellow_threshold:
                    segments.append("yellow")
                else:
                    segments.append("green")
            else:
                segments.append("off")

        return {
            "level_dbfs": self.current_level,
            "peak_dbfs": self.peak,
            "segments": segments,
            "level_percent": max(0, min(100, (self.current_level + 60) * (100 / 60))),
            "peak_percent": max(0, min(100, (self.peak + 60) * (100 / 60))),
        }


class GainReductionMeter:
    """Compressor/Limiter gain reduction meter."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.gr_db = 0.0
        self.peak_gr = 0.0
        self.gr_history = []

    def process(self, samples: np.ndarray, threshold_db: float = -20.0) -> dict:
        threshold_linear = 10 ** (threshold_db / 20)
        env = np.abs(samples)
        
        if np.mean(env) > threshold_linear:
            ratio = 4.0
            compressed = np.where(
                env > threshold_linear,
                threshold_linear + (env - threshold_linear) / ratio,
                env
            )
            gr_db = 20 * np.log10(np.mean(compressed / (env + 1e-10)) + 1e-10)
        else:
            gr_db = 0.0

        self.gr_db = gr_db
        self.peak_gr = min(0, min(self.peak_gr - 1, gr_db))
        
        self.gr_history.append(gr_db)
        if len(self.gr_history) > 100:
            self.gr_history.pop(0)

        return {
            "gr_db": self.gr_db,
            "peak_gr_db": self.peak_gr,
            "gr_history": self.gr_history,
            "gr_percent": max(0, min(100, -self.gr_db * 5)),
        }


class RTAMeter:
    """Real-Time Analyzer for frequency spectrum display."""

    def __init__(self, band_count: int = 31, sr: int = 48000):
        self.band_count = band_count
        self.sr = sr
        self.smoothed_bands = np.zeros(band_count)
        self.peak_bands = np.zeros(band_count)
        self.alpha = 0.3

        self.freq_bins = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]

    def process(self, samples: np.ndarray) -> dict:
        from scipy.signal import welch

        if len(samples) < 1024:
            return {"bands": self.smoothed_bands.tolist(), "peaks": self.peak_bands.tolist()}

        freqs, psd = welch(samples, self.sr, nperseg=min(4096, len(samples)))

        band_levels = np.zeros(self.band_count)
        for i in range(self.band_count):
            freq_low = self.freq_bins[i] * 0.9
            freq_high = self.freq_bins[min(i + 1, self.band_count - 1)] * 1.1
            
            mask = (freqs >= freq_low) & (freqs <= freq_high)
            if np.any(mask):
                band_levels[i] = 10 * np.log10(np.mean(psd[mask]) + 1e-10)
            else:
                band_levels[i] = -60

        self.smoothed_bands = self.alpha * band_levels + (1 - self.alpha) * self.smoothed_bands
        
        peak_mask = band_levels > self.peak_bands
        self.peak_bands[peak_mask] = band_levels[peak_mask]
        self.peak_bands = np.maximum(self.peak_bands - 0.5, -60)

        normalized = [(level + 60) / 60 for level in self.smoothed_bands]
        normalized_peaks = [(level + 60) / 60 for level in self.peak_bands]

        return {
            "bands": normalized,
            "peaks": normalized_peaks,
            "frequencies": self.freq_bins,
            "db_levels": self.smoothed_bands.tolist(),
        }


class StereoCorrelationMeter:
    """Stereo correlation and phase correlation meter."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.correlation = 0.0
        self.correlation_history = []
        self.phase_left = 0.0
        self.phase_right = 0.0

    def process(self, left: np.ndarray, right: np.ndarray) -> dict:
        if len(left) != len(right) or len(left) == 0:
            return {"correlation": 0.0, "phase": "unknown"}

        norm = np.sqrt(np.mean(left ** 2) * np.mean(right ** 2)) + 1e-10
        self.correlation = float(np.mean(left * right) / norm)

        self.correlation_history.append(self.correlation)
        if len(self.correlation_history) > 50:
            self.correlation_history.pop(0)

        mid = (left + right) / 2
        side = (left - right) / 2

        mid_rms = np.sqrt(np.mean(mid ** 2))
        side_rms = np.sqrt(np.mean(side ** 2))

        width = 0.0
        if (mid_rms + side_rms) > 1e-10:
            width = (mid_rms - side_rms) / (mid_rms + side_rms)

        phase_desc = "Mono"
        if self.correlation > 0.7:
            phase_desc = "Mono / Narrow"
        elif self.correlation > 0.3:
            phase_desc = "Normal"
        elif self.correlation > -0.3:
            phase_desc = "Wide"
        else:
            phase_desc = "Phase Issue"

        return {
            "correlation": self.correlation,
            "correlation_history": self.correlation_history,
            "width": width,
            "phase_description": phase_desc,
            "mid_dbfs": 20 * np.log10(mid_rms + 1e-10),
            "side_dbfs": 20 * np.log10(side_rms + 1e-10),
        }


class VUMeter:
    """Classic VU meter with ballistics."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.left_value = -20.0
        self.right_value = -20.0
        self.attack_coef = 0.9993
        self.release_coef = 0.9997

    def process(self, left: np.ndarray, right: np.ndarray) -> dict:
        left_rms = 20 * np.log10(np.sqrt(np.mean(left ** 2)) + 1e-10)
        right_rms = 20 * np.log10(np.sqrt(np.mean(right ** 2)) + 1e-10)

        if left_rms > self.left_value:
            self.left_value = self.attack_coef * self.left_value + (1 - self.attack_coef) * left_rms
        else:
            self.left_value = self.release_coef * self.left_value + (1 - self.release_coef) * left_rms

        if right_rms > self.right_value:
            self.right_value = self.attack_coef * self.right_value + (1 - self.attack_coef) * right_rms
        else:
            self.right_value = self.release_coef * self.right_value + (1 - self.release_coef) * right_rms

        return {
            "left_vu": self.left_value,
            "right_vu": self.right_value,
            "left_percent": max(0, min(100, (self.left_value + 20) * 5)),
            "right_percent": max(0, min(100, (self.right_value + 20) * 5)),
        }


class LoudnessMeter:
    """EBU R128 loudness meter."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.block_duration = 0.4
        self.integrated_sum = 0.0
        self.integrated_count = 0
        self.short_term_history = []
        self.momentary_buffer = []
        self.max_history = 75

    def process(self, samples: np.ndarray) -> dict:
        self.momentary_buffer.append(samples)

        block_samples = int(self.block_duration * self.sr)
        total_samples = sum(len(buf) for buf in self.momentary_buffer)

        if total_samples >= block_samples:
            buffer = np.concatenate(self.momentary_buffer)
            block = buffer[-block_samples:]
            self.momentary_buffer = [block[block_samples:]]

            lufs = self._compute_block_lufs(block)

            self.short_term_history.append(lufs)
            if len(self.short_term_history) > self.max_history:
                self.short_term_history.pop(0)

            self.integrated_sum += 10 ** (lufs / 10)
            self.integrated_count += 1

        momentary = self.short_term_history[-1] if self.short_term_history else -70.0

        short_term = -70.0
        if len(self.short_term_history) > 0:
            st_vals = 10 ** (np.array(self.short_term_history) / 10)
            short_term = 10 * np.log10(np.mean(st_vals) + 1e-10)

        integrated = -70.0
        if self.integrated_count > 0:
            integrated = 10 * np.log10(self.integrated_sum / self.integrated_count + 1e-10)

        loudness_range = 0.0
        if len(self.short_term_history) >= 3:
            st_arr = np.array(self.short_term_history)
            loudness_range = 10 * np.log10(np.max(st_arr) - np.min(st_arr) + 1e-10)

        true_peak = 20 * np.log10(np.max(np.abs(samples)) + 1e-10)

        return {
            "integrated_lufs": integrated,
            "short_term_lufs": short_term,
            "momentary_lufs": momentary,
            "loudness_range_lu": loudness_range,
            "true_peak_dbfs": true_peak,
        }

    def _compute_block_lufs(self, block: np.ndarray) -> float:
        block_sq = block ** 2
        power = np.mean(block_sq)

        if power < 1e-10:
            return -70.0

        block_lufs = 10 * np.log10(power)
        return float(block_lufs)


class MonitoringDashboard:
    """Complete audio monitoring dashboard."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.level_meter = LevelMeter(sr=sr)
        self.gr_meter = GainReductionMeter(sr=sr)
        self.rta_meter = RTAMeter(sr=sr)
        self.correlation_meter = StereoCorrelationMeter(sr=sr)
        self.vu_meter = VUMeter(sr=sr)
        self.loudness_meter = LoudnessMeter(sr=sr)

    def process(self, samples: np.ndarray) -> dict:
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
            mono = (left + right) / 2
        else:
            left = right = mono = samples

        return {
            "level": self.level_meter.process(mono),
            "gain_reduction": self.gr_meter.process(mono),
            "rta": self.rta_meter.process(mono),
            "stereo": self.correlation_meter.process(left, right),
            "vu": self.vu_meter.process(left, right),
            "loudness": self.loudness_meter.process(mono),
        }

    def reset(self) -> None:
        self.level_meter = LevelMeter(sr=self.sr)
        self.gr_meter = GainReductionMeter(sr=self.sr)
        self.rta_meter = RTAMeter(sr=self.sr)
        self.correlation_meter = StereoCorrelationMeter(sr=self.sr)
        self.vu_meter = VUMeter(sr=self.sr)
        self.loudness_meter = LoudnessMeter(sr=self.sr)