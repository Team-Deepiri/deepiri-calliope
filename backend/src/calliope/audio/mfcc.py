from __future__ import annotations

import numpy as np

from calliope.dsp.filters import preemphasis


def _hz_to_mel(f: np.ndarray) -> np.ndarray:
    return 2595.0 * np.log10(1.0 + f / 700.0)


def _mel_to_hz(m: np.ndarray) -> np.ndarray:
    return 700.0 * (np.power(10.0, m / 2595.0) - 1.0)


def _dct_ii_ortho_first_n(x: np.ndarray, n_coeff: int) -> np.ndarray:
    """Type-II DCT, orthonormal, first `n_coeff` bins."""
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.size
    if n == 0:
        return np.zeros(n_coeff, dtype=np.float64)
    out = np.zeros(n_coeff, dtype=np.float64)
    out[0] = float(np.sum(x) / np.sqrt(n))
    if n_coeff <= 1:
        return out
    ks = np.arange(1, n_coeff, dtype=np.float64)[:, None]
    j = np.arange(n, dtype=np.float64)[None, :]
    cosm = np.cos(np.pi / (2.0 * n) * (2.0 * j + 1.0) * ks)
    out[1:] = np.sqrt(2.0 / n) * (cosm @ x)
    return out


def _mel_filterbank(sr: int, n_fft: int, n_mels: int, fmin: float, fmax: float) -> np.ndarray:
    """Shape (n_mels, n_bins)."""
    n_bins = n_fft // 2 + 1
    m_min = _hz_to_mel(np.array([fmin]))[0]
    m_max = _hz_to_mel(np.array([fmax]))[0]
    points = np.linspace(m_min, m_max, n_mels + 2)
    hz = _mel_to_hz(points)
    bins = np.floor((n_fft + 1) * hz / sr).astype(int)
    fb = np.zeros((n_mels, n_bins), dtype=np.float64)
    for m in range(n_mels):
        f_lo, f_c, f_hi = bins[m], bins[m + 1], bins[m + 2]
        for k in range(f_lo, f_c):
            if f_c != f_lo:
                fb[m, k] = (k - f_lo) / (f_c - f_lo)
        for k in range(f_c, f_hi):
            if f_hi != f_c:
                fb[m, k] = (f_hi - k) / (f_hi - f_c)
    enorm = np.maximum(np.sum(fb, axis=1, keepdims=True), 1e-12)
    return fb / enorm


def mfcc_mean(
    y: np.ndarray,
    sr: int,
    *,
    n_mfcc: int = 13,
    n_mels: int = 40,
    n_fft: int = 512,
    hop: int = 160,
    fmin: float = 0.0,
    fmax: float | None = None,
) -> np.ndarray:
    """Mean MFCC vector across frames (first `n_mfcc` coeffs including C0)."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if y.size < n_fft:
        y = np.pad(y, (0, n_fft - y.size))
    y = preemphasis(y, 0.97)
    fmax = fmax if fmax is not None else sr / 2.0
    win = np.hanning(n_fft)
    fb = _mel_filterbank(sr, n_fft, n_mels, fmin, min(fmax, sr / 2.0 - 1.0))
    mfccs: list[np.ndarray] = []
    for start in range(0, len(y) - n_fft + 1, hop):
        frame = y[start : start + n_fft] * win
        power = np.abs(np.fft.rfft(frame, n=n_fft)) ** 2
        mel = np.dot(fb, power[: fb.shape[1]])
        log_mel = np.log(np.maximum(mel, 1e-10))
        mfcc = _dct_ii_ortho_first_n(log_mel, n_mfcc)
        mfccs.append(mfcc)
    if not mfccs:
        return np.zeros(n_mfcc, dtype=np.float64)
    return np.mean(np.stack(mfccs, axis=0), axis=0)
