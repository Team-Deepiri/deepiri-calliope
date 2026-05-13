"""Phase vocoder time-stretch / pitch-shift (scipy STFT); Ellis-style recipe."""

from __future__ import annotations

import numpy as np
from scipy import signal


def _hann_fftbin(n_fft: int) -> np.ndarray:
    return signal.get_window("hann", n_fft, fftbins=True)


def stft_complex(
    y: np.ndarray,
    sr: int,
    *,
    n_fft: int,
    hop_length: int,
) -> np.ndarray:
    win = _hann_fftbin(n_fft)
    _, _, Z = signal.stft(
        np.asarray(y, dtype=np.float64).ravel(),
        fs=sr,
        window=win,
        nperseg=n_fft,
        noverlap=n_fft - hop_length,
        boundary="zeros",
        padded=True,
        nfft=n_fft,
    )
    return Z


def istft_complex(
    Z: np.ndarray,
    sr: int,
    *,
    n_fft: int,
    hop_length: int,
    length: int | None = None,
) -> np.ndarray:
    win = _hann_fftbin(n_fft)
    _, x = signal.istft(
        Z,
        fs=sr,
        window=win,
        nperseg=n_fft,
        noverlap=n_fft - hop_length,
        input_onesided=True,
        boundary=True,
        nfft=n_fft,
    )
    x = np.asarray(x, dtype=np.float64).ravel()
    if length is not None:
        if x.size >= length:
            x = x[:length]
        else:
            x = np.pad(x, (0, length - x.size))
    return x


def phase_vocoder_time_stretch(D: np.ndarray, rate: float, hop_length: int, sr: int, n_fft: int) -> np.ndarray:
    """
    Time-stretch STFT columns by `rate` (>1 = faster / fewer frames).
    D shape (n_bins, n_frames), complex (one-sided STFT).
    """
    if rate <= 0:
        raise ValueError("rate must be positive")
    D = np.asarray(D, dtype=np.complex128)
    n_freq, n_time = D.shape
    time_steps = np.arange(0.0, float(n_time), rate, dtype=np.float64)
    n_out = len(time_steps)
    d_stretch = np.zeros((n_freq, n_out), dtype=np.complex128)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    phi_advance = 2.0 * np.pi * hop_length * freqs
    phase_acc = np.angle(D[:, 0])
    Dp = np.pad(D, ((0, 0), (0, 2)), mode="constant")
    for ti, step in enumerate(time_steps):
        i0 = int(np.floor(step))
        alpha = float(step - i0)
        col0 = Dp[:, i0]
        col1 = Dp[:, i0 + 1]
        mag = (1.0 - alpha) * np.abs(col0) + alpha * np.abs(col1)
        dphase = np.angle(col1) - np.angle(col0) - phi_advance
        dphase = dphase - 2.0 * np.pi * np.round(dphase / (2.0 * np.pi))
        phase_acc = phase_acc + phi_advance + dphase
        d_stretch[:, ti] = mag * np.exp(1j * phase_acc)
    return d_stretch


def pitch_shift_phase_vocoder(
    y: np.ndarray,
    sr: int,
    semitones: float,
    *,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """
    Pitch-shift by `semitones` while preserving approximate duration (phase vocoder + FFT resample).
    """
    y = np.asarray(y, dtype=np.float64).ravel()
    n = y.size
    if n == 0:
        return y.copy()
    rate = float(2.0 ** (-semitones / 12.0))
    Z = stft_complex(y, sr, n_fft=n_fft, hop_length=hop_length)
    Zs = phase_vocoder_time_stretch(Z, rate, hop_length, sr, n_fft)
    ys = istft_complex(Zs, sr, n_fft=n_fft, hop_length=hop_length, length=None)
    if ys.size == 0:
        return np.zeros_like(y)
    out = signal.resample(ys, n)
    return np.asarray(out, dtype=np.float64)
