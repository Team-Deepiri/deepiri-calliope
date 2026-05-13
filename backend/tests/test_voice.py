import numpy as np

from calliope.voice import band_energy_ratios, spectral_tilt_db_per_oct, zero_crossing_rate


def test_zcr_range():
    y = np.sin(np.linspace(0, 50, 10_000))
    z = zero_crossing_rate(y, frame=512, hop=256)
    assert z.size >= 1
    assert np.all(z >= 0) and np.all(z <= 1)


def test_band_energy_sums():
    m = np.ones(129)
    f = np.linspace(0, 8000, 129)
    r = band_energy_ratios(m, f, [(0, 1000), (1000, 4000), (4000, 8000)])
    assert abs(sum(r) - 1.0) < 1e-6


def test_tilt_finite():
    m = np.linspace(1, 0.1, 200)
    f = np.linspace(100, 8000, 200)
    t = spectral_tilt_db_per_oct(m, f)
    assert np.isfinite(t)
