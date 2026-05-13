import numpy as np

from calliope.audio import mfcc_mean, stft_magnitude


def test_stft_shape():
    sr = 16_000
    y = np.random.default_rng(1).normal(scale=0.01, size=sr // 2)
    mag, times = stft_magnitude(y, n_fft=256, hop=128, sr=sr)
    assert mag.ndim == 2
    assert mag.shape[1] == 256 // 2 + 1
    assert len(times) == mag.shape[0]


def test_mfcc_mean_length():
    sr = 16_000
    y = np.random.default_rng(2).normal(scale=0.02, size=8000)
    m = mfcc_mean(y, sr, n_mfcc=13, n_fft=512, hop=160)
    assert m.shape == (13,)
