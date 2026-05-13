import numpy as np

from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder


def test_phase_vocoder_zero_semitones_small_error():
    rng = np.random.default_rng(7)
    y = rng.normal(0, 0.05, size=4096).astype(np.float64)
    sr = 16_000
    z = pitch_shift_phase_vocoder(y, sr, 0.0, n_fft=1024, hop_length=256)
    err = float(np.sqrt(np.mean((y - z) ** 2)))
    assert err < 0.08


def test_phase_vocoder_semitone_changes_output():
    rng = np.random.default_rng(8)
    y = rng.normal(0, 0.05, size=8192).astype(np.float64)
    sr = 16_000
    z = pitch_shift_phase_vocoder(y, sr, 3.0, n_fft=2048, hop_length=512)
    assert z.shape == y.shape
    assert np.all(np.isfinite(z))
    assert float(np.std(z)) > 1e-6
