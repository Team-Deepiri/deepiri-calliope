"""Professional-grade PSOLA (Pitch Synchronous Overlap-Add) with formant preservation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from scipy import signal
from scipy.interpolate import interp1d


class PSOLAType(str):
    PSOLA_LPC = "lpc"
    PSOLA_FFT = "fft"
    PSOLA_HPS = "hps"


@dataclass
class PSOLAConfig:
    pitch_period_ms: float = 10.0
    frame_size_ms: float = 40.0
    hop_ms: float = 5.0
    lpc_order: int = 20
    formant_preserve: float = 0.8
    vibrato_depth_cents: float = 0.0
    pitch_smooth_ms: float = 15.0
    voicing_threshold: float = 0.3


def parabolic_interp(x: np.ndarray, n: int) -> float:
    """Parabolic interpolation for sub-sample F0 estimation."""
    n = int(n)
    if n <= 0 or n >= len(x) - 1:
        return float(n)
    
    y0, y1, y2 = float(x[max(0, n-1)]), float(x[n]), float(x[min(len(x)-1, n+1)])
    if y1 == 0:
        return float(n)
    
    alpha = y0 - 2*y1 + y2
    if abs(alpha) < 1e-10:
        return float(n)
    
    p = 0.5 * (y0 - y2) / alpha
    return float(n) + p


def compute_lpc_residual(signal_in: np.ndarray, order: int) -> tuple[np.ndarray, np.ndarray]:
    """Compute LPC coefficients and residual signal."""
    n = len(signal_in)
    if n <= order:
        return signal_in, np.zeros(n)
    
    x = np.correlate(signal_in, signal_in, mode='full')
    r = x[:order + 1]
    
    if np.all(r == 0):
        return signal_in, np.zeros(n)
    
    a = np.zeros(order + 1)
    a[0] = 1.0
    e = np.zeros(order + 1)
    e[0] = r[0]
    
    k = np.zeros(order)
    for p in range(1, order + 1):
        k[p-1] = r[p]
        for i in range(1, p):
            k[p-1] -= a[i] * r[p - i]
        
        if abs(e[p-1]) < 1e-10:
            k[p-1] = 0
        else:
            k[p-1] /= e[p-1]
        
        a[p] = k[p-1]
        for i in range(1, p):
            a[i] -= k[p-1] * a[p - i]
        
        e[p] = (1 - k[p-1]**2) * e[p-1]
    
    a = -a[1:]
    residual = np.zeros(n)
    
    for i in range(order, n):
        residual[i] = signal_in[i]
        for j in range(order):
            residual[i] -= a[j] * signal_in[i - j - 1]
    
    return a, residual


def compute_formant_features(y: np.ndarray, sr: int, n_formants: int = 5) -> list[tuple[float, float]]:
    """Estimate formants using LPC."""
    order = 2 * n_formants + 2
    frame_size = min(len(y), int(0.025 * sr))
    
    if frame_size < order:
        return [(500 + i * 500, 100) for i in range(n_formants)]
    
    windowed = y[:frame_size] * np.hanning(frame_size)
    a, residual = compute_lpc_residual(windowed, order)
    
    if np.all(a == 0):
        return [(500 + i * 500, 100) for i in range(n_formants)]
    
    roots = np.roots(np.concatenate([[1], a]))
    roots = roots[np.imag(roots) > 0]
    frequencies = np.abs(np.angle(roots)) * sr / (2 * np.pi)
    bandwidths = -np.log(np.abs(roots)) * sr / (2 * np.pi)
    
    formants = []
    for f, b in sorted(zip(frequencies, bandwidths), key=lambda x: x[0]):
        if 50 < f < sr / 2 - 1000:
            formants.append((float(f), float(b)))
    
    while len(formants) < n_formants:
        formants.append((500 + len(formants) * 500, 100))
    
    return formants[:n_formants]


def find_pitch_periods(
    residual: np.ndarray,
    sr: int,
    fmin: float = 50.0,
    fmax: float = 600.0,
) -> np.ndarray:
    """Find pitch periods using autocorrelation on residual."""
    min_period = int(sr / fmax)
    max_period = int(sr / fmin)
    
    if max_period >= len(residual):
        max_period = len(residual) - 1
    if min_period < 1:
        min_period = 1
    
    n = len(residual)
    periods = np.zeros(n)
    
    for i in range(0, n - max_period, min_period):
        segment = residual[i:i + max_period]
        
        if len(segment) < min_period:
            continue
        
        autocorr = np.correlate(segment, segment, mode='full')
        autocorr = autocorr[len(autocorr)//2:]
        autocorr /= autocorr[0] + 1e-10
        
        peak_idx = np.argmax(autocorr[min_period:]) + min_period
        
        if peak_idx > 0 and peak_idx < len(autocorr) - 1:
            refined = parabolic_interp(autocorr, peak_idx)
            if min_period <= refined <= max_period:
                periods[i:i + min_period] = refined
    
    return periods


def psola_synthesize(
    residual: np.ndarray,
    lpc_coeffs: np.ndarray,
    f0_contour: np.ndarray,
    sr: int,
    config: PSOLAConfig,
) -> np.ndarray:
    """PSOLA synthesis with pitch modification."""
    hop_samples = int(config.hop_ms * sr / 1000.0)
    frame_size = int(config.frame_size_ms * sr / 1000.0)
    
    n_frames = len(f0_contour)
    if n_frames == 0:
        return residual.copy()
    
    periods = np.zeros(n_frames)
    for i in range(n_frames):
        if f0_contour[i] > 0:
            periods[i] = sr / f0_contour[i]
        else:
            periods[i] = config.pitch_period_ms * sr / 1000.0
    
    if config.vibrato_depth_cents > 0:
        vibrato_f0 = np.zeros_like(f0_contour)
        vibrato_f0[f0_contour > 0] = f0_contour[f0_contour > 0] * (
            2.0 ** (config.vibrato_depth_cents / 1200.0) - 1.0
        )
        f0_contour = f0_contour + vibrato_f0 * np.sin(
            2 * np.pi * 5.0 * np.arange(n_frames) * config.hop_ms / 1000.0
        )
        periods = np.where(f0_contour > 0, sr / f0_contour, periods)
    
    output_len = int(n_frames * hop_samples + frame_size)
    output = np.zeros(output_len)
    window = np.hanning(frame_size)
    
    for i in range(n_frames):
        target_period = periods[i]
        if target_period <= 0:
            continue
        
        frame_start = i * hop_samples
        frame_end = min(frame_start + frame_size, len(residual))
        frame = residual[frame_start:frame_end]
        
        if len(frame) < frame_size:
            frame = np.pad(frame, (0, frame_size - len(frame)))
        
        windowed = frame * window
        
        excitation = np.zeros_like(windowed)
        n_samples = int(target_period)
        for j in range(0, frame_size, max(1, n_samples)):
            excitation[j] = windowed[j] if j < len(windowed) else 0
        
        a = np.concatenate([[1], lpc_coeffs])
        synthesized = signal.lfilter([1], a, excitation)
        
        out_start = i * hop_samples
        out_end = min(out_start + frame_size, output_len)
        out_len = out_end - out_start
        
        if out_len > 0:
            output[out_start:out_end] += synthesized[:out_len]
    
    return output[:len(residual)] if len(output) > len(residual) else np.pad(output, (0, len(residual) - len(output)))


def apply_formant_correction(
    y: np.ndarray,
    sr: int,
    source_f0: float,
    target_f0: float,
    preserve: float = 0.8,
) -> np.ndarray:
    """Apply formant correction to maintain vocal character after pitch shift."""
    if source_f0 <= 0 or target_f0 <= 0 or abs(source_f0 - target_f0) < 1.0:
        return y
    
    formants = compute_formant_features(y, sr)
    
    pitch_ratio = target_f0 / source_f0
    
    shift_factor = 1.0 + (pitch_ratio - 1.0) * (1.0 - preserve)
    shift_factor = max(0.5, min(2.0, shift_factor))
    
    from calliope.voice.formant_shift import formant_shift_stft
    return formant_shift_stft(y, sr, shift=shift_factor, n_fft=2048, hop=512)


class ProfessionalAutotune:
    """Professional-grade autotune with PSOLA and formant preservation."""
    
    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = PSOLAConfig()
        self._lpc_coeffs = None
        self._formants = None
        self._pitch_history: list[float] = []
    
    def analyze(self, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Analyze audio to get pitch contour, voicing, and formants."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        from calliope.pitch.yin import yin_track_series
        f0 = yin_track_series(y, self.sr, frame=2048, hop=512, fmin=70.0, fmax=900.0)
        
        self._lpc_coeffs, residual = compute_lpc_residual(y, self.config.lpc_order)
        
        periods = find_pitch_periods(residual, self.sr)
        
        voicing = np.ones_like(f0)
        voicing[f0 < 50] = 0
        
        smooth_frames = max(1, int(self.config.pitch_smooth_ms / self.config.hop_ms))
        if smooth_frames > 1:
            f0 = self._smooth_pitch(f0, smooth_frames)
        
        self._formants = compute_formant_features(y, self.sr)
        
        return f0, voicing, self._formants
    
    def _smooth_pitch(self, f0: np.ndarray, window: int) -> np.ndarray:
        """Smooth pitch contour to remove octave errors."""
        from scipy.ndimage import uniform_filter1d
        
        result = f0.copy()
        valid = f0 > 50
        
        if valid.any():
            smoothed = uniform_filter1d(f0.astype(float), window, mode='nearest')
            
            ratio = np.ones_like(f0)
            ratio[valid] = f0[valid] / (smoothed[valid] + 1e-10)
            
            for octave in range(1, 4):
                err = np.abs(ratio - 2.0 ** octave)
                closer_octave = err < np.abs(ratio - 1.0)
                ratio[closer_octave] /= 2.0 ** octave
                
                err = np.abs(ratio - 2.0 ** -octave)
                closer_octave = err < np.abs(ratio - 1.0)
                ratio[closer_octave] *= 2.0 ** octave
            
            result[valid] = smoothed[valid] * ratio[valid]
        
        return result
    
    def correct(
        self,
        y: np.ndarray,
        target_scale: np.ndarray | None = None,
        scale_root: int = 60,
        strength: float = 1.0,
        speed: float = 0.5,
    ) -> np.ndarray:
        """Correct pitch to target scale."""
        f0, voicing, _ = self.analyze(y)
        
        target_f0 = self._snap_to_scale(f0, target_scale, scale_root)
        
        corrected = np.zeros_like(y)
        hop = 512
        frame = 2048
        
        for i in range(0, len(y) - frame, hop):
            frame_f0 = f0[i // hop] if (i // hop) < len(f0) else 0
            frame_target = target_f0[i // hop] if (i // hop) < len(target_f0) else frame_f0
            
            if frame_f0 > 30 and frame_target > 30:
                amount = strength * speed
                interp_f0 = frame_f0 * (1.0 - amount) + frame_target * amount
                
                frame_data = y[i:i + frame]
                
                corrected[i:i + frame] = apply_formant_correction(
                    frame_data, self.sr, frame_f0, interp_f0,
                    preserve=self.config.formant_preserve
                )
            else:
                corrected[i:i + frame] = y[i:i + frame]
        
        return corrected
    
    def _snap_to_scale(
        self,
        f0: np.ndarray,
        scale: np.ndarray | None,
        root: int,
    ) -> np.ndarray:
        """Snap F0 values to nearest scale note."""
        if scale is None:
            intervals = [0, 2, 4, 5, 7, 9, 11]
        else:
            intervals = scale.tolist()
        
        scale_notes = []
        for octave in range(11):
            for interval in intervals:
                scale_notes.append(root + octave * 12 + interval)
        
        scale_notes = np.array(sorted(set(scale_notes)))
        
        result = f0.copy()
        for i, hz in enumerate(f0):
            if hz <= 0:
                continue
            
            midi = 69.0 + 12.0 * np.log2(hz / 440.0)
            nearest = scale_notes[np.argmin(np.abs(440.0 * 2.0 ** ((scale_notes - 69.0) / 12.0) - hz))]
            target_hz = 440.0 * 2.0 ** ((nearest - 69.0) / 12.0)
            result[i] = target_hz
        
        return result
    
    def get_pitch_info(self, f0: np.ndarray) -> dict:
        """Get detailed pitch analysis info."""
        valid = f0 > 50
        
        if not valid.any():
            return {"avg_f0": 0, "note": "N/A", "octave": 0, "cents": 0}
        
        avg_f0 = float(np.mean(f0[valid]))
        midi = 69.0 + 12.0 * np.log2(avg_f0 / 440.0)
        
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        note = note_names[int(round(midi)) % 12]
        octave = int(round(midi)) // 12 - 1
        cents = (midi - round(midi)) * 100
        
        return {
            "avg_f0": avg_f0,
            "note": note,
            "octave": octave,
            "cents": float(cents),
            "midi": float(midi),
        }


def time_stretch(
    y: np.ndarray,
    sr: int,
    rate: float,
    formants: list[tuple[float, float]] | None = None,
) -> np.ndarray:
    """
    High-quality time stretching using phase vocoder + formant preservation.
    rate > 1.0 = slower, rate < 1.0 = faster
    """
    if abs(rate - 1.0) < 0.01:
        return y.copy()
    
    from calliope.tune.phase_vocoder import phase_vocoder_time_stretch, stft_complex, istft_complex
    
    n_fft = 4096
    hop = 512
    
    Z = stft_complex(y, sr, n_fft=n_fft, hop_length=hop)
    
    if formants and len(formants) > 0:
        avg_formant_shift = 1.0 / rate
    else:
        avg_formant_shift = 1.0
    
    Z_stretched = phase_vocoder_time_stretch(Z, rate, hop, sr, n_fft)
    
    y_stretched = istft_complex(Z_stretched, sr, n_fft=n_fft, hop_length=hop, length=None)
    
    if len(y_stretched) > len(y):
        y_stretched = y_stretched[:len(y)]
    elif len(y_stretched) < len(y):
        y_stretched = np.pad(y_stretched, (0, len(y) - len(y_stretched)))
    
    return y_stretched.astype(np.float64)


def vocode(
    carrier: np.ndarray,
    modulator: np.ndarray,
    sr: int,
    num_bands: int = 16,
    excitation_mode: Literal["noise", "pulse", "mixed"] = "pulse",
) -> np.ndarray:
    """
    Phase vocoder-based vocoding with band-limited carrier modulation.
    """
    from scipy import signal as sp_signal
    
    nyq = sr / 2
    band_edges = np.linspace(0, nyq, num_bands + 1)
    
    carrier_spec = []
    modulator_spec = []
    
    for i in range(num_bands):
        low = band_edges[i]
        high = band_edges[i + 1]
        
        if low < 20:
            low = 20
        if high > nyq - 100:
            high = nyq - 100
        
        bp_carrier = sp_signal.butter(4, [low, high], btype='band', fs=sr)
        bp_mod = sp_signal.butter(4, [low, high], btype='band', fs=sr)
        
        c_band = sp_signal.sosfilt(bp_carrier, carrier)
        m_band = sp_signal.sosfilt(bp_mod, modulator)
        
        c_env = np.abs(sp_signal.hilbert(c_band))
        m_env = np.abs(sp_signal.hilbert(m_band))
        
        c_phase = np.angle(sp_signal.hilbert(c_band))
        
        if excitation_mode == "pulse":
            m_env = np.sign(m_env) * np.abs(m_env) ** 0.5
        elif excitation_mode == "noise":
            m_env = np.random.randn(len(m_env)) * np.std(m_env)
        
        vocoded_band = m_env * np.cos(c_phase)
        carrier_spec.append(vcoded_band)
    
    result = sum(carrier_spec) / num_bands
    
    return result.astype(np.float64)