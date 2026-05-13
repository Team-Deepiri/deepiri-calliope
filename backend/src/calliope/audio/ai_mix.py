"""AI-powered auto-mix and mastering engine."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Literal


@dataclass
class MixSettings:
    target_lufs: float = -14.0
    stereo_width: float = 1.0
    warmth: float = 0.3
    brightness: float = 0.5
    punch: float = 0.5
    depth: float = 0.5
    saturation: float = 0.2


@dataclass
class MasteringParams:
    input_gain_db: float = 0.0
    compression_amount: float = 0.4
    eq_low_shelf: float = 0.0
    eq_high_shelf: float = 0.0
    saturation_harmonics: float = 0.2
    limiter_ceiling: float = -0.3
    stereo_width: float = 1.0


class AIMixEngine:
    """AI-powered automatic mixing and mastering."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.mix_settings = MixSettings()
        self.mastering_params = MasteringParams()

    def analyze_track_balance(self, samples: np.ndarray) -> dict:
        """Analyze track for proper balance adjustment."""
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
            mono = (left + right) / 2
        else:
            mono = samples
            left = right = samples

        rms_left = 20 * np.log10(np.sqrt(np.mean(left ** 2)) + 1e-10)
        rms_right = 20 * np.log10(np.sqrt(np.mean(right ** 2)) + 1e-10)
        rms_mono = 20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-10)

        peak_left = 20 * np.log10(np.max(np.abs(left)) + 1e-10)
        peak_right = 20 * np.log10(np.max(np.abs(right)) + 1e-10)

        correlation = np.mean(left * right) / (np.sqrt(np.mean(left ** 2) * np.mean(right ** 2)) + 1e-10)

        from calliope.audio.spectrum import compute_spectrum
        spec = compute_spectrum(mono, self.sr, fft_size=4096)
        freq_bins = np.fft.rfftfreq(4096, 1.0 / self.sr)

        low_mask = freq_bins < 200
        mid_mask = (freq_bins >= 200) & (freq_bins < 4000)
        high_mask = freq_bins >= 4000

        low_energy = np.mean(spec[low_mask]) if np.any(low_mask) else 0
        mid_energy = np.mean(spec[mid_mask]) if np.any(mid_mask) else 0
        high_energy = np.mean(spec[high_mask]) if np.any(high_mask) else 0

        total_energy = low_energy + mid_energy + high_energy + 1e-10
        balance = {
            "low_ratio": low_energy / total_energy,
            "mid_ratio": mid_energy / total_energy,
            "high_ratio": high_energy / total_energy,
        }

        return {
            "rms_left_dbfs": rms_left,
            "rms_right_dbfs": rms_right,
            "rms_mono_dbfs": rms_mono,
            "peak_left_dbfs": peak_left,
            "peak_right_dbfs": peak_right,
            "stereo_correlation": float(correlation),
            "frequency_balance": balance,
            "dynamic_range_db": float(peak_left - rms_mono),
        }

    def auto_level(self, samples: np.ndarray, target_lufs: float = -14.0) -> np.ndarray:
        """Automatically adjust level to target LUFS."""
        from calliope.audio.loudness import measure_lufs
        
        current_lufs = measure_lufs(samples, self.sr)
        gain_db = target_lufs - current_lufs
        gain_linear = 10 ** (gain_db / 20)
        
        return samples * gain_linear

    def auto_eq(self, samples: np.ndarray, balance: dict, brightness: float = 0.5) -> np.ndarray:
        """Apply automatic EQ based on frequency analysis."""
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
        else:
            left = right = samples

        target_low = 0.3 + (1 - balance.get("low_ratio", 0.33)) * 0.2
        target_high = 0.3 + balance.get("high_ratio", 0.33) * 0.3

        low_gain = (target_low - 0.5) * 6
        high_gain = (target_high - 0.5) * 6

        from scipy.signal import butter, lfilter

        def apply_shelf(sample, freq, gain_db, filter_type="high"):
            nyq = self.sr / 2
            if filter_type == "high":
                b, a = butter(2, freq / nyq, btype="high")
            else:
                b, a = butter(2, freq / nyq, btype="low")
            filtered = lfilter(b, a, sample)

            if gain_db > 0:
                return sample + (filtered - sample) * (gain_db / 6)
            else:
                return sample + (filtered - sample) * (abs(gain_db) / 12)

        low_corrected = apply_shelf(left, 200, low_gain, "low")
        high_corrected = apply_shelf(low_corrected, 4000, high_gain, "high")

        if samples.ndim == 2:
            return np.stack([high_corrected, apply_shelf(right, 200, low_gain, "low")], axis=1)
        return high_corrected

    def auto_compression(self, samples: np.ndarray, amount: float = 0.4) -> np.ndarray:
        """Apply automatic compression with intelligent settings."""
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
        else:
            left = right = samples

        threshold_db = -20 + (amount * 10)
        ratio = 1 + (amount * 4)

        def compress(sample, threshold_db, ratio):
            threshold_linear = 10 ** (threshold_db / 20)
            
            env = np.abs(sample)
            attack = 0.9995
            release = 0.9999
            
            envelope = np.zeros_like(env)
            for i in range(len(env)):
                if env[i] > envelope[max(0, i-1)]:
                    envelope[i] = attack * envelope[max(0, i-1)] + (1 - attack) * env[i]
                else:
                    envelope[i] = release * envelope[max(0, i-1)] + (1 - release) * env[i]

            gain_reduction = np.ones_like(envelope)
            above_threshold = envelope > threshold_linear
            gain_reduction[above_threshold] = (threshold_linear + (envelope[above_threshold] - threshold_linear) / ratio) / envelope[above_threshold]

            return sample * gain_reduction

        compressed = compress(left, threshold_db, ratio)
        
        if samples.ndim == 2:
            return np.stack([compressed, compress(right, threshold_db, ratio)], axis=1)
        return compressed

    def auto_stereo_width(self, samples: np.ndarray, width: float = 1.0) -> np.ndarray:
        """Adjust stereo width with correlation control."""
        if samples.ndim != 2:
            return samples

        left = samples[:, 0]
        right = samples[:, 1]

        mid = (left + right) / 2
        side = (left - right) / 2

        if width > 1.0:
            side = side * width
        elif width < 1.0:
            side = side * width

        new_left = mid + side
        new_right = mid - side

        peak = np.max(np.abs(np.stack([new_left, new_right])))
        if peak > 1.0:
            new_left = new_left / peak * 0.99
            new_right = new_right / peak * 0.99

        return np.stack([new_left, new_right], axis=1)

    def add_warmth(self, samples: np.ndarray, amount: float = 0.3) -> np.ndarray:
        """Add analog warmth with harmonic saturation."""
        if samples.ndim == 2:
            left = samples[:, 0]
            right = samples[:, 1]
        else:
            left = right = samples

        def saturate(sample, drive):
            soft_clip = lambda x: np.tanh(x * (1 + drive * 3))
            saturated = soft_clip(sample * (1 + drive))
            return sample * (1 - amount) + saturated * amount

        warmed = saturate(left, amount)
        
        if samples.ndim == 2:
            return np.stack([warmed, saturate(right, amount)], axis=1)
        return warmed

    def auto_master(self, samples: np.ndarray, settings: MasteringParams) -> np.ndarray:
        """Apply full automatic mastering chain."""
        processed = samples.copy()

        if settings.input_gain_db != 0:
            gain = 10 ** (settings.input_gain_db / 20)
            processed = processed * gain

        if settings.compression_amount > 0:
            processed = self.auto_compression(processed, settings.compression_amount)

        if settings.eq_low_shelf != 0 or settings.eq_high_shelf != 0:
            processed = self.auto_eq(processed, {"low_ratio": 0.33, "high_ratio": 0.33})

        if settings.saturation_harmonics > 0:
            processed = self.add_warmth(processed, settings.saturation_harmonics)

        if settings.stereo_width != 1.0:
            processed = self.auto_stereo_width(processed, settings.stereo_width)

        if settings.limiter_ceiling < 0:
            ceiling = 10 ** (settings.limiter_ceiling / 20)
            peak = np.max(np.abs(processed))
            if peak > ceiling:
                processed = processed * (ceiling / peak)

        return processed

    def full_auto_mix(
        self,
        samples: np.ndarray,
        target_lufs: float = -14.0,
        brightness: float = 0.5,
        warmth: float = 0.3,
        punch: float = 0.5,
        stereo_width: float = 1.0,
    ) -> dict:
        """Run full automatic mix with all parameters."""
        analysis = self.analyze_track_balance(samples)

        mix_settings = MixSettings(
            target_lufs=target_lufs,
            brightness=brightness,
            warmth=warmth,
            punch=punch,
            stereo_width=stereo_width,
        )

        processed = samples.copy()

        processed = self.auto_level(processed, mix_settings.target_lufs)

        balance = analysis["frequency_balance"]
        processed = self.auto_eq(processed, balance, mix_settings.brightness)

        if mix_settings.punch > 0.3:
            processed = self.auto_compression(processed, mix_settings.punch * 0.5)

        processed = self.add_warmth(processed, mix_settings.warmth)

        processed = self.auto_stereo_width(processed, mix_settings.stereo_width)

        mastering = MasteringParams(
            compression_amount=0.3 + (mix_settings.punch * 0.3),
            saturation_harmonics=mix_settings.warmth,
            limiter_ceiling=-0.3,
            stereo_width=mix_settings.stereo_width,
        )
        processed = self.auto_master(processed, mastering)

        post_analysis = self.analyze_track_balance(processed)

        return {
            "processed_samples": processed,
            "input_analysis": analysis,
            "output_analysis": post_analysis,
            "settings_used": {
                "target_lufs": target_lufs,
                "brightness": brightness,
                "warmth": warmth,
                "punch": punch,
                "stereo_width": stereo_width,
            },
            "improvements": {
                "dynamic_range_change_db": post_analysis["dynamic_range_db"] - analysis["dynamic_range_db"],
                "stereo_correlation_change": post_analysis["stereo_correlation"] - analysis["stereo_correlation"],
            },
        }


def auto_mix(
    samples: np.ndarray,
    sr: int = 48000,
    target_lufs: float = -14.0,
    brightness: float = 0.5,
    warmth: float = 0.3,
    punch: float = 0.5,
    stereo_width: float = 1.0,
) -> np.ndarray:
    """Convenience function for automatic mixing."""
    engine = AIMixEngine(sr)
    result = engine.full_auto_mix(samples, target_lufs, brightness, warmth, punch, stereo_width)
    return result["processed_samples"]


def auto_master(
    samples: np.ndarray,
    sr: int = 48000,
    style: Literal["loud", "balanced", "subtle"] = "balanced",
) -> np.ndarray:
    """Apply style-based automatic mastering."""
    styles = {
        "loud": MasteringParams(
            target_lufs=-11, compression_amount=0.5, eq_high_shelf=1, saturation_harmonics=0.3, limiter_ceiling=-0.5
        ),
        "balanced": MasteringParams(
            target_lufs=-14, compression_amount=0.4, eq_high_shelf=0.5, saturation_harmonics=0.2, limiter_ceiling=-0.3
        ),
        "subtle": MasteringParams(
            target_lufs=-16, compression_amount=0.2, eq_high_shelf=0, saturation_harmonics=0.1, limiter_ceiling=-0.2
        ),
    }

    engine = AIMixEngine(sr)
    params = styles.get(style, styles["balanced"])

    processed = engine.auto_level(samples, params.target_lufs if hasattr(params, 'target_lufs') else -14)
    processed = engine.auto_master(processed, params)

    return processed