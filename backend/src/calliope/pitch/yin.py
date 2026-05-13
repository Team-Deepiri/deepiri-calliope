from __future__ import annotations

import numpy as np


def _autocorr_aperiodic(x: np.ndarray, max_tau: int) -> np.ndarray:
    """
    Aperiodic autocorrelation R[tau] = sum_{j=0}^{N-tau-1} x[j]x[j+tau], tau=0..max_tau-1.
    FFT O(N log N) via zero-padded correlation.
    """
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.shape[0]
    if n < 2:
        return np.zeros(max(1, max_tau), dtype=np.float64)
    nfft = 1 << int(np.ceil(np.log2(max(2 * n, 8))))
    xp = np.zeros(nfft, dtype=np.float64)
    xp[:n] = x
    X = np.fft.rfft(xp)
    ac_full = np.fft.irfft(X * np.conj(X), n=nfft).real
    return ac_full[:max_tau].copy()


def _difference_function_fft(x: np.ndarray, tau_max: int) -> np.ndarray:
    """YIN difference d(tau) for tau = 0 .. tau_max-1 (Cheveigné & Kawahara)."""
    x = np.asarray(x, dtype=np.float64).ravel()
    n = x.shape[0]
    d = np.zeros(tau_max, dtype=np.float64)
    if tau_max < 1 or n < 2:
        return d
    x = x - float(np.mean(x))
    x2 = x * x
    c = np.concatenate([[0.0], np.cumsum(x2)])
    R = _autocorr_aperiodic(x, tau_max)
    taus = np.arange(1, min(tau_max, n), dtype=np.int64)
    if taus.size == 0:
        return d
    sum_x2 = c[n - taus] - c[0]
    sum_x2_shift = c[n] - c[taus]
    d[taus] = sum_x2 + sum_x2_shift - 2.0 * R[taus]
    return d


def _cumulative_mean_normalized_difference(d: np.ndarray) -> np.ndarray:
    s = np.maximum(np.cumsum(d), 1e-18)
    taus = np.arange(len(d), dtype=np.float64)
    out = d * taus / s
    out[0] = 1.0
    return out


def _parabolic_argmin(y: np.ndarray, i: int) -> float:
    """Refined fractional index of minimum near integer peak i (1 <= i < len(y)-1)."""
    if i <= 0 or i >= len(y) - 1:
        return float(i)
    y0, y1, y2 = float(y[i - 1]), float(y[i]), float(y[i + 1])
    denom = y0 - 2.0 * y1 + y2
    if abs(denom) < 1e-12:
        return float(i)
    return float(i) + (y0 - y2) / (2.0 * denom)


def yin_track_frame(
    frame: np.ndarray,
    sr: int,
    *,
    fmin: float = 50.0,
    fmax: float = 2000.0,
    thresh: float = 0.15,
) -> float:
    """Return refined fundamental Hz for one frame using YIN + parabolic CMNDF refinement; 0 if unvoiced."""
    f0, _cmn, _tau = yin_track_frame_detailed(frame, sr, fmin=fmin, fmax=fmax, thresh=thresh)
    return f0


def yin_track_frame_detailed(
    frame: np.ndarray,
    sr: int,
    *,
    fmin: float = 50.0,
    fmax: float = 2000.0,
    thresh: float = 0.15,
) -> tuple[float, float, float]:
    """
    Returns (f0_hz, cmndf_minimum, refined_lag_samples).
    cmndf_minimum is near 0 for strong voicing; 1 means no pitch.
    """
    x = np.asarray(frame, dtype=np.float64)
    n = int(x.shape[0])
    if n < 8:
        return 0.0, 1.0, 0.0
    tau_max = min(n // 2, int(sr / fmin) + 2)
    tau_min = max(2, int(sr / fmax))
    if tau_max <= tau_min + 2:
        return 0.0, 1.0, 0.0
    d = _difference_function_fft(x, tau_max)
    cmndf = _cumulative_mean_normalized_difference(d)
    search = cmndf[tau_min:tau_max]
    below = np.where(search < thresh)[0]
    if len(below) == 0:
        rel = int(np.argmin(search))
    else:
        rel = int(below[0])
    i0 = tau_min + rel
    i_ref = int(np.clip(i0, 1, len(cmndf) - 2))
    tau_f = _parabolic_argmin(cmndf, i_ref)
    if tau_f <= 0.0:
        return 0.0, float(np.min(search)), tau_f
    f0 = float(sr / tau_f)
    cmin = float(np.interp(tau_f, np.arange(len(cmndf), dtype=np.float64), cmndf))
    return f0, cmin, tau_f


def yin_track_series(
    y: np.ndarray,
    sr: int,
    *,
    frame: int = 2048,
    hop: int = 512,
    fmin: float = 50.0,
    fmax: float = 2000.0,
    thresh: float = 0.15,
) -> np.ndarray:
    """F0 contour (Hz), one value per hop-aligned frame."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if len(y) < frame:
        y = np.pad(y, (0, frame - len(y)))
    out: list[float] = []
    for start in range(0, len(y) - frame + 1, hop):
        f0 = yin_track_frame(y[start : start + frame], sr, fmin=fmin, fmax=fmax, thresh=thresh)
        out.append(f0)
    return np.array(out, dtype=np.float64)


def yin_track_series_voicing(
    y: np.ndarray,
    sr: int,
    *,
    frame: int = 2048,
    hop: int = 512,
    fmin: float = 50.0,
    fmax: float = 2000.0,
    thresh: float = 0.15,
) -> tuple[np.ndarray, np.ndarray]:
    """Returns (f0_hz, voicing_strength) where strength = 1 - min(cmndf,1)."""
    y = np.asarray(y, dtype=np.float64).ravel()
    if len(y) < frame:
        y = np.pad(y, (0, frame - len(y)))
    f0s: list[float] = []
    vs: list[float] = []
    for start in range(0, len(y) - frame + 1, hop):
        f0, cmin, _ = yin_track_frame_detailed(y[start : start + frame], sr, fmin=fmin, fmax=fmax, thresh=thresh)
        f0s.append(f0)
        vs.append(float(max(0.0, min(1.0, 1.0 - cmin))))
    return np.array(f0s, dtype=np.float64), np.array(vs, dtype=np.float64)
