import numpy as np

from calliope.processing import peak_normalize, rms_envelope, rms_target_normalize, run_chain


def test_peak_normalize():
    y = np.array([2.0, -4.0])
    z = peak_normalize(y, peak=0.5)
    assert abs(np.max(np.abs(z)) - 0.5) < 1e-9


def test_rms_envelope_shape():
    y = np.sin(np.linspace(0, 30, 5000))
    e = rms_envelope(y, frame=256, hop=128)
    assert e.size >= 1


def test_chain():
    y = np.ones(100)
    z = run_chain(y, [lambda a: a * 2.0, lambda a: a + 1.0])
    assert z[0] == 3.0


def test_rms_target_finite():
    y = np.random.default_rng(0).normal(scale=0.1, size=2000)
    z = rms_target_normalize(y, target_dbfs=-20.0)
    assert np.all(np.isfinite(z))
