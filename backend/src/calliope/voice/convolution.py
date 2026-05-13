"""Convolution reverb with IR loading and processing."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from scipy import signal


@dataclass
class ConvolutionConfig:
    ir_path: str | None = None
    ir_samples: np.ndarray | None = None
    ir_sr: int = 48000
    wet_mix: float = 0.5
    predelay_ms: float = 0.0
    output_gain_db: float = 0.0
    high_cut_hz: float = 20000.0
    low_cut_hz: float = 20.0
    normalize: bool = True
    reverse_ir: bool = False


class ConvolutionReverb:
    """
    Convolution reverb using impulse responses.
    Supports IR loading, predelay, EQ filtering, and normalization.
    """

    def __init__(self, sr: int = 48000, config: ConvolutionConfig | None = None):
        self.sr = sr
        self.config = config or ConvolutionConfig()
        self._ir: np.ndarray | None = None
        self._ir_processed: np.ndarray | None = None
        self._fft_size = 0

        if self.config.ir_path:
            self.load_ir(self.config.ir_path)
        elif self.config.ir_samples is not None:
            self.set_ir(self.config.ir_samples, self.config.ir_sr)

    def load_ir(self, path: str | Path) -> None:
        """Load impulse response from audio file."""
        from calliope.audio.io import read_audio_file
        
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"IR file not found: {path}")

        ir, ir_sr = read_audio_file(path, sr=self.sr, mono=True)
        
        self._ir = ir
        self.config.ir_sr = ir_sr
        self._process_ir()

    def set_ir(self, samples: np.ndarray, sr: int = 48000) -> None:
        """Set impulse response from samples."""
        self._ir = np.asarray(samples, dtype=np.float64).ravel()
        self.config.ir_sr = sr
        
        if sr != self.sr:
            from scipy import signal as sp_signal
            num_samples = int(len(self._ir) * self.sr / sr)
            self._ir = sp_signal.resample(self._ir, num_samples)
        
        self._process_ir()

    def _process_ir(self) -> None:
        """Process IR (normalize, filter, reverse, etc.)."""
        if self._ir is None:
            return

        ir = self._ir.copy()

        if self.config.predelay_ms > 0:
            delay_samples = int(self.config.predelay_ms * self.sr / 1000.0)
            ir = np.concatenate([np.zeros(delay_samples), ir])

        if self.config.low_cut_hz > 20.0:
            sos = signal.butter(2, self.config.low_cut_hz, btype='high', output='sos', fs=self.sr)
            ir = signal.sosfilt(sos, ir)

        if self.config.high_cut_hz < 20000.0:
            sos = signal.butter(2, self.config.high_cut_hz, btype='low', output='sos', fs=self.sr)
            ir = signal.sosfilt(sos, ir)

        if self.config.normalize:
            peak = float(np.max(np.abs(ir)))
            if peak > 1e-9:
                ir = ir / peak * 0.9

        if self.config.reverse_ir:
            ir = ir[::-1]

        self._ir_processed = ir
        
        self._fft_size = 2 ** (len(ir) - 1).bit_length()

    def process(self, y: np.ndarray) -> np.ndarray:
        """Apply convolution reverb to audio."""
        if self._ir_processed is None:
            return np.asarray(y, dtype=np.float64)

        y = np.asarray(y, dtype=np.float64).ravel()
        
        if self._fft_size == 0:
            self._fft_size = 2 ** (len(y) - 1).bit_length()

        dry = y.copy()
        
        convolved = signal.fftconvolve(y, self._ir_processed, mode='full')
        
        if self.config.output_gain_db != 0.0:
            gain = 10 ** (self.config.output_gain_db / 20.0)
            convolved = convolved * gain
        
        max_len = max(len(dry), len(convolved))
        if len(dry) < max_len:
            dry = np.pad(dry, (0, max_len - len(dry)))
        if len(convolved) < max_len:
            convolved = np.pad(convolved, (0, max_len - len(convolved)))

        output = dry * (1.0 - self.config.wet_mix) + convolved * self.config.wet_mix
        
        peak = np.max(np.abs(output))
        if peak > 0.99:
            output = output * 0.99 / peak

        return output[:len(y)].astype(np.float64) if len(output) > len(y) else np.pad(output, (0, len(y) - len(output)))

    def process_fft(self, y: np.ndarray) -> np.ndarray:
        """FFT-based convolution (faster for long IRs)."""
        if self._ir_processed is None:
            return np.asarray(y, dtype=np.float64).ravel()

        y = np.asarray(y, dtype=np.float64).ravel()
        
        n = len(y) + len(self._ir_processed) - 1
        fft_size = 2 ** (n - 1).bit_length()

        Y = np.fft.rfft(y, n=fft_size)
        H = np.fft.rfft(self._ir_processed, n=fft_size)
        
        convolved = np.fft.irfft(Y * H, n=fft_size)
        
        if self.config.wet_mix < 1.0:
            convolved = y * (1.0 - self.config.wet_mix) + convolved * self.config.wet_mix
        else:
            convolved = convolved * self.config.wet_mix
        
        return convolved[:len(y)].astype(np.float64)

    def process_stereo(
        self,
        left: np.ndarray,
        right: np.ndarray | None = None,
        ir_right: np.ndarray | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Process stereo pair with optional different IRs."""
        if self._ir_processed is None:
            left_out = np.asarray(left, dtype=np.float64)
            right_out = np.asarray(right if right is not None else left, dtype=np.float64)
            return left_out, right_out

        left_out = self.process(left)
        
        if right is not None:
            if ir_right is not None:
                original_ir = self._ir_processed
                self.set_ir(ir_right, self.sr)
                right_out = self.process(right)
                self._ir_processed = original_ir
            else:
                ir_shifted = self._shift_ir(self._ir_processed, int(0.003 * self.sr))
                original_ir = self._ir_processed
                self._ir_processed = ir_shifted
                right_out = self.process(right)
                self._ir_processed = original_ir
        else:
            right_out = left_out

        return left_out, right_out

    def _shift_ir(self, ir: np.ndarray, samples: int) -> np.ndarray:
        """Shift IR for stereo imaging."""
        shifted = np.zeros_like(ir)
        if samples >= 0:
            shifted[samples:] = ir[:len(ir) - samples]
        else:
            shifted[:samples] = ir[-samples:]
        return shifted

    def get_ir_info(self) -> dict:
        """Get impulse response metadata."""
        if self._ir is None:
            return {"loaded": False}

        return {
            "loaded": True,
            "length_samples": len(self._ir),
            "length_ms": len(self._ir) / self.sr * 1000.0,
            "sample_rate": self.sr,
            "predelay_samples": int(self.config.predelay_ms * self.sr / 1000.0),
        }


def generate_impulse_response(
    sr: int,
    length_ms: float = 2000.0,
    decay_type: Literal["exponential", "plate", "hall", "room"] = "exponential",
    early_reflections: int = 8,
    diffusion: float = 0.7,
) -> np.ndarray:
    """Generate synthetic impulse response for testing."""
    n_samples = int(sr * length_ms / 1000.0)
    ir = np.zeros(n_samples)

    if decay_type == "exponential":
        decay = np.exp(-5.0 * np.arange(n_samples) / n_samples)
        ir = np.random.randn(n_samples) * decay

    elif decay_type == "plate":
        decay = np.exp(-8.0 * np.arange(n_samples) / n_samples)
        noise = np.random.randn(n_samples)
        sos_hpf = signal.butter(2, 200, btype='high', output='sos', fs=sr)
        sos_lpf = signal.butter(2, 8000, btype='low', output='sos', fs=sr)
        noise = signal.sosfilt(sos_lpf, signal.sosfilt(sos_hpf, noise))
        ir = noise * decay

    elif decay_type == "hall":
        for i in range(early_reflections):
            pos = int(i * n_samples / (early_reflections + 5) + np.random.rand() * sr * 0.01)
            if pos < n_samples:
                ir[pos] = np.random.randn() * 0.5 * np.exp(-i / early_reflections)

        decay = np.exp(-3.0 * np.arange(n_samples) * 3 / n_samples)
        diffusion_noise = np.random.randn(n_samples) * decay * diffusion
        sos_lpf = signal.butter(2, 5000, btype='low', output='sos', fs=sr)
        diffusion_noise = signal.sosfilt(sos_lpf, diffusion_noise)
        ir = ir + diffusion_noise * 0.3

    elif decay_type == "room":
        for i in range(early_reflections):
            pos = int(np.random.rand() * sr * 0.05)
            if pos < n_samples:
                ir[pos] = np.random.randn() * 0.8

        decay = np.exp(-15.0 * np.arange(n_samples) / n_samples)
        noise = np.random.randn(n_samples) * decay * 0.2
        sos_lpf = signal.butter(2, 2000, btype='low', output='sos', fs=sr)
        noise = signal.sosfilt(sos_lpf, noise)
        ir = ir + noise

    return ir.astype(np.float64)


def extract_reverb_params(ir: np.ndarray, sr: int) -> dict:
    """Analyze IR to extract reverb parameters."""
    peak = float(np.max(np.abs(ir)))
    peak_idx = int(np.argmax(np.abs(ir)))

    for i in range(len(ir) - 1, 0, -1):
        if abs(ir[i]) > peak * 0.001:
            end_idx = i
            break
    else:
        end_idx = len(ir) - 1

    rt60 = (end_idx - peak_idx) / sr
    rt20 = rt60 * 20 / 60
    rt10 = rt60 * 10 / 60

    for i in range(peak_idx, len(ir)):
        if abs(ir[i]) < peak * 0.1:
            rt10_idx = i
            break
    else:
        rt10_idx = end_idx

    for i in range(peak_idx, len(ir)):
        if abs(ir[i]) < peak * 0.01:
            rt20_idx = i
            break
    else:
        rt20_idx = end_idx

    for i in range(peak_idx, len(ir)):
        if abs(ir[i]) < peak * 0.001:
            rt30_idx = i
            break
    else:
        rt30_idx = end_idx

    return {
        "rt60_ms": rt60 * 1000.0,
        "rt20_ms": rt20 * 1000.0,
        "rt10_ms": rt10 * 1000.0,
        "predelay_ms": peak_idx / sr * 1000.0,
        "total_length_ms": len(ir) / sr * 1000.0,
        "peak_db": 20.0 * np.log10(peak + 1e-10),
    }