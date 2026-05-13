import numpy as np

from calliope.tune import major_scale_midi, pitch_shift_interpolate, retune_contour_linear


def test_major_scale_contains_seven():
    s = major_scale_midi(60)
    assert len(s) == 7


def test_pitch_shift_finite():
    y = np.sin(np.linspace(0, 20, 5000))
    z = pitch_shift_interpolate(y, 3.0)
    assert z.shape == y.shape
    assert np.all(np.isfinite(z))


def test_retune_ratios_ones_for_silence():
    f0 = np.zeros(5)
    t, r = retune_contour_linear(f0)
    assert np.allclose(r, 1.0)
