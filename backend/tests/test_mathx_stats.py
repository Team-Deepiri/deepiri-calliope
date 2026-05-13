import numpy as np

from calliope.mathx.stats import spectral_centroid, spectral_rolloff


def test_centroid_mid():
    f = np.linspace(0, 1000, 50)
    m = np.zeros(50)
    m[25] = 1.0
    c = spectral_centroid(m, f)
    assert 400 < c < 600


def test_rolloff():
    f = np.linspace(0, 1000, 100)
    m = np.ones(100)
    r = spectral_rolloff(m, f, rolloff=0.5)
    assert r > 0
