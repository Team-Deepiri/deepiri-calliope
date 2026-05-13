"""Real-time audio visualization engine."""

from __future__ import annotations

import numpy as np
from typing import Callable
from dataclasses import dataclass


@dataclass
class VisualizerConfig:
    fft_size: int = 2048
    hop_size: int = 512
    smoothing_time: float = 0.1
    peak_decay: float = 0.95
    peak_hold: int = 30


class SpectrumVisualizer:
    """Real-time spectrum analyzer with peak hold."""

    def __init__(self, config: VisualizerConfig | None = None, sr: int = 48000):
        self.config = config or VisualizerConfig()
        self.sr = sr
        self.fft_size = self.config.fft_size
        self.hop_size = self.config.hop_size
        self.window = np.hanning(self.fft_size)
        
        self.smoothed_magnitude = np.zeros(self.fft_size // 2)
        self.peak_magnitude = np.zeros(self.fft_size // 2)
        self.peak_hold_counter = np.zeros(self.fft_size // 2, dtype=np.int32)
        
        self.alpha = np.exp(-1.0 / (self.config.smoothing_time * sr / self.hop_size))

    def process(self, samples: np.ndarray) -> dict:
        """Process audio block and return visualization data."""
        if len(samples) < self.fft_size:
            padded = np.pad(samples, (0, self.fft_size - len(samples)))
        else:
            padded = samples[:self.fft_size]
        
        windowed = padded * self.window
        
        spectrum = np.fft.rfft(windowed)
        magnitude = np.abs(spectrum)
        
        self.smoothed_magnitude = self.alpha * self.smoothed_magnitude + (1 - self.alpha) * magnitude
        
        peak_mask = magnitude > self.peak_magnitude
        self.peak_magnitude[peak_mask] = magnitude[peak_mask]
        self.peak_hold_counter[peak_mask] = 0
        
        decay_mask = ~peak_mask
        self.peak_hold_counter[decay_mask] += 1
        if self.config.peak_hold > 0:
            expired = self.peak_hold_counter > self.config.peak_hold
            self.peak_magnitude[expired] *= self.config.peak_decay
        
        bin_count = len(magnitude)
        freq_per_bin = self.sr / 2 / bin_count
        
        db_magnitude = 20 * np.log10(np.maximum(self.smoothed_magnitude, 1e-10))
        db_peak = 20 * np.log10(np.maximum(self.peak_magnitude, 1e-10))
        
        octaves = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
        octave_levels = []
        for freq in octaves:
            bin_idx = int(freq / freq_per_bin)
            if bin_idx >= bin_count:
                bin_idx = bin_count - 1
            start_bin = max(0, bin_idx - 2)
            end_bin = min(bin_count, bin_idx + 3)
            level = np.mean(db_magnitude[start_bin:end_bin])
            octave_levels.append(level)
        
        centroid = self._compute_spectral_centroid(magnitude)
        
        return {
            "spectrum": (db_magnitude + 90) / 90,
            "peak": (db_peak + 90) / 90,
            "octave_levels": [(max(0, min(1, (l + 90) / 90)) if l > -90 else 0) for l in octave_levels],
            "centroid_hz": centroid,
            "crest": float(np.max(db_magnitude) - np.mean(db_magnitude)) if len(db_magnitude) > 0 else 0,
            "rms_dbfs": 20 * np.log10(np.sqrt(np.mean(samples ** 2)) + 1e-10),
            "peak_dbfs": float(np.max(np.abs(samples))),
        }

    def _compute_spectral_centroid(self, magnitude: np.ndarray) -> float:
        if magnitude.sum() < 1e-10:
            return 0.0
        freqs = np.fft.rfftfreq(self.fft_size, 1.0 / self.sr)
        return float(np.sum(freqs * magnitude) / np.sum(magnitude))


class WaveformVisualizer:
    """Real-time waveform display with envelope tracking."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.envelope = 0.0
        self.peak = 0.0
        self.peak_hold = 0.0
        self.peak_count = 0

    def process(self, samples: np.ndarray) -> dict:
        """Process audio block and return waveform data."""
        block_size = len(samples)
        
        rms = np.sqrt(np.mean(samples ** 2))
        envelope = 20 * np.log10(rms + 1e-10)
        self.envelope = self.envelope * 0.95 + envelope * 0.05
        
        block_peak = np.max(np.abs(samples))
        block_peak_db = 20 * np.log10(block_peak + 1e-10)
        
        if block_peak > self.peak:
            self.peak = block_peak
            self.peak_count = 0
        else:
            self.peak_count += 1
            if self.peak_count > 30:
                self.peak *= 0.98
        
        downsampled_peaks = []
        chunk_size = max(1, block_size // 100)
        for i in range(0, block_size, chunk_size):
            chunk = samples[i : i + chunk_size]
            if len(chunk) == 0:
                continue
            peak_val = np.max(np.abs(chunk))
            downsampled_peaks.append(peak_val)
        
        return {
            "peaks": downsampled_peaks,
            "envelope_db": self.envelope,
            "peak_dbfs": 20 * np.log10(block_peak + 1e-10),
            "peak_hold_dbfs": 20 * np.log10(self.peak + 1e-10),
            "rms_dbfs": self.envelope,
        }


class PitchVisualizer:
    """Real-time pitch detection visualizer."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.history_f0 = []
        self.history_confidence = []
        self.max_history = 200

    def process(self, samples: np.ndarray) -> dict:
        """Process audio block and return pitch data."""
        from calliope.tune.gravy_autotune import detect_pitch_crepe
        
        if len(samples) < 2048:
            return {
                "f0": 0.0,
                "confidence": 0.0,
                "note": "—",
                "cents": 0,
                "waveform": samples.tolist() if len(samples) > 0 else [],
            }
        
        f0_data, confidence = detect_pitch_crepe(samples, self.sr)
        
        if len(f0_data) > 0:
            weighted_f0 = np.sum(f0_data * confidence) / (np.sum(confidence) + 1e-10)
            weighted_conf = np.mean(confidence)
        else:
            weighted_f0 = 0.0
            weighted_conf = 0.0
        
        if len(f0_data) > 0:
            self.history_f0.append(weighted_f0)
            self.history_confidence.append(weighted_conf)
            if len(self.history_f0) > self.max_history:
                self.history_f0.pop(0)
                self.history_confidence.pop(0)
        
        note = "—"
        cents = 0
        if weighted_f0 > 20 and weighted_conf > 0.5:
            midi_note = 69 + 12 * np.log2(weighted_f0 / 440)
            note_idx = int(round(midi_note)) % 12
            note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            note = note_names[note_idx]
            cents = int((midi_note - round(midi_note)) * 100)
        
        return {
            "f0": float(weighted_f0),
            "confidence": float(weighted_conf),
            "note": note,
            "cents": cents,
            "waveform": samples[::4].tolist(),
            "history": self.history_f0[-100:],
            "confidence_history": self.history_confidence[-100:],
        }


class LoudnessVisualizer:
    """Real-time loudness metering (ITU-R BS.1770 style)."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.block_duration = 0.4
        self.smoothing = 0.3
        
        self.integrated_sum = 0.0
        self.integrated_count = 0
        self.short_term_history = []
        self.max_history = 75
        
        self.momentary_buffer = []
        self.block_size = int(self.block_duration * sr)

    def process(self, samples: np.ndarray) -> dict:
        """Process audio block and return loudness data."""
        self.momentary_buffer.append(samples)
        
        if len(np.concatenate(self.momentary_buffer)) >= self.block_size:
            block = np.concatenate(self.momentary_buffer)[-self.block_size :]
            self.momentary_buffer = [block[-self.block_size :]]
            
            lufs = self._compute_lufs(block, self.sr)
            
            self.short_term_history.append(lufs)
            if len(self.short_term_history) > self.max_history:
                self.short_term_history.pop(0)
            
            self.integrated_sum += 10 ** (lufs / 10)
            self.integrated_count += 1
        
        momentary = self.short_term_history[-1] if self.short_term_history else -70.0
        
        short_term = -70.0
        if self.short_term_history:
            st_vals = 10 ** (np.array(self.short_term_history) / 10)
            if len(st_vals) > 0:
                short_term = 10 * np.log10(np.mean(st_vals) + 1e-10)
        
        integrated = -70.0
        if self.integrated_count > 0:
            integrated = 10 * np.log10(self.integrated_sum / self.integrated_count + 1e-10)
        
        loudness_range = 0.0
        if len(self.short_term_history) >= 3:
            st_arr = np.array(self.short_term_history)
            loudness_range = 10 * np.log10(np.max(st_arr) - np.min(st_arr) + 1e-10)
        
        return {
            "integrated": float(integrated),
            "short_term": float(short_term),
            "momentary": float(momentary),
            "range": float(loudness_range),
            "true_peak": float(np.max(np.abs(samples))),
        }

    def _compute_lufs(self, samples: np.ndarray, sr: int) -> float:
        block_samples = int(0.4 * sr)
        
        blocks = []
        for i in range(0, len(samples) - block_samples, block_samples // 2):
            block = samples[i : i + block_samples]
            
            block_sq = block ** 2
            power = np.mean(block_sq)
            
            if power < 1e-10:
                blocks.append(-70.0)
            else:
                blocks.append(10 * np.log10(power))
        
        if not blocks:
            return -70.0
        
        blocks = np.array(blocks)
        gated = blocks[blocks > -70]
        
        if len(gated) == 0:
            return -70.0
        
        avg_power = np.mean(10 ** (gated / 10))
        gamma_r = -0.691 + 10 * np.log10(avg_power + 1e-10)
        
        gamma_g = max(-70, gamma_r - 10.35)
        
        gated_blocks = blocks[blocks > gamma_g]
        
        if len(gated_blocks) == 0:
            return -70.0
        
        final_lufs = 10 * np.log10(np.mean(10 ** (gated_blocks / 10)) + 1e-10)
        return float(final_lufs)


class StereoVisualizer:
    """Stereo field analysis and correlation."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.correlation_history = []
        self.max_history = 50

    def process(self, left: np.ndarray, right: np.ndarray) -> dict:
        """Process stereo pair and return correlation data."""
        if len(left) != len(right):
            min_len = min(len(left), len(right))
            left = left[:min_len]
            right = right[:min_len]
        
        n = len(left)
        
        norm = np.sqrt(np.mean(left ** 2) * np.mean(right ** 2)) + 1e-10
        correlation = np.mean(left * right) / norm
        
        self.correlation_history.append(correlation)
        if len(self.correlation_history) > self.max_history:
            self.correlation_history.pop(0)
        
        diff = left - right
        sum_lr = left + right
        
        diff_rms = np.sqrt(np.mean(diff ** 2))
        sum_rms = np.sqrt(np.mean(sum_lr ** 2))
        
        width = 0.0
        if (diff_rms + sum_rms) > 1e-10:
            width = (sum_rms - diff_rms) / (sum_rms + diff_rms + 1e-10)
        
        energy = (left ** 2 + right ** 2) / 2
        
        side_energy = (diff ** 2) / 2
        
        side_ratio = np.mean(side_energy) / (np.mean(energy) + 1e-10)
        
        return {
            "correlation": float(correlation),
            "width": float(width),
            "side_ratio": float(side_ratio),
            "correlation_history": self.correlation_history,
            "loudness": float(10 * np.log10(np.mean(energy) + 1e-10)),
        }


def create_visualizer_chain(sr: int = 48000) -> dict[str, callable]:
    """Create a chain of visualizers for audio processing."""
    return {
        "spectrum": SpectrumVisualizer(sr=sr),
        "waveform": WaveformVisualizer(sr=sr),
        "pitch": PitchVisualizer(sr=sr),
        "loudness": LoudnessVisualizer(sr=sr),
    }


def visualize_audio_block(
    samples: np.ndarray,
    sr: int = 48000,
    visualizers: dict | None = None,
) -> dict:
    """Process audio block through all visualizers."""
    if visualizers is None:
        visualizers = create_visualizer_chain(sr)
    
    mono = samples
    if samples.ndim == 2:
        mono = (samples[:, 0] + samples[:, 1]) / 2
    
    result = {
        "waveform": visualizers["waveform"].process(mono),
        "spectrum": visualizers["spectrum"].process(mono),
        "pitch": visualizers["pitch"].process(mono),
        "loudness": visualizers["loudness"].process(mono),
    }
    
    if samples.ndim == 2:
        result["stereo"] = StereoVisualizer(sr).process(samples[:, 0], samples[:, 1])
    
    return result