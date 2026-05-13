import numpy as np

from calliope.pitch import yin_track_frame
from calliope.pitch.yin import _difference_function_fft


def test_difference_fft_matches_bruteforce_small():
    rng = np.random.default_rng(42)
    x = rng.normal(size=128).astype(np.float64)
    tau_max = 60
    d_fast = _difference_function_fft(x, tau_max)
    # brute O(n^2) for taus 1..tau_max-1
    n = len(x)
    x = x - np.mean(x)
    d_slow = np.zeros(tau_max)
    x2 = x * x
    c = np.concatenate([[0.0], np.cumsum(x2)])
    for tau in range(1, min(tau_max, n)):
        s2 = c[n - tau] - c[0]
        s2s = c[n] - c[tau]
        cross = float(np.dot(x[: n - tau], x[tau:n]))
        d_slow[tau] = s2 + s2s - 2.0 * cross
    assert np.allclose(d_fast[1:50], d_slow[1:50], rtol=1e-9, atol=1e-9)


def test_yin_440_tighter():
    sr = 48_000
    t = np.arange(sr // 8) / sr
    y = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    f0 = yin_track_frame(y, sr, fmin=80.0, fmax=1200.0)
    assert 415 < f0 < 465
