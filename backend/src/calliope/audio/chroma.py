from __future__ import annotations

import numpy as np


def chroma_mean_from_mag(mag: np.ndarray, sr: int, n_fft: int) -> np.ndarray:
    """
    Mean chroma vector (12 pitch classes) from STFT magnitudes.
    mag shape (n_frames, n_bins); bins correspond to rfftfreq(n_fft, 1/sr).
    """
    m = np.asarray(mag, dtype=np.float64)
    if m.size == 0:
        return np.zeros(12, dtype=np.float64)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    chroma = np.zeros(12, dtype=np.float64)
    for k, f_hz in enumerate(freqs):
        if f_hz <= 1.0:
            continue
        midi = 69.0 + 12.0 * np.log2(f_hz / 440.0)
        pc = int(round(midi)) % 12
        chroma[pc] += float(np.sum(m[:, k]))
    s = float(np.sum(chroma))
    if s <= 1e-18:
        return np.zeros(12, dtype=np.float64)
    return (chroma / s).astype(np.float64)
