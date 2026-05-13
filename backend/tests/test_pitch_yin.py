import numpy as np

from calliope.pitch import snap_hz_equal_temperament, yin_track_frame, yin_track_series


def test_snap_hz():
    f = snap_hz_equal_temperament(442.0)
    assert abs(f - 440.0) < 1.0


def test_yin_sine_close_to_440():
    sr = 48_000
    t = np.arange(sr // 10) / sr
    y = 0.5 * np.sin(2 * np.pi * 440.0 * t)
    f0 = yin_track_frame(y, sr, fmin=80.0, fmax=1200.0)
    assert f0 > 350 and f0 < 520


def test_yin_series_length():
    sr = 16_000
    n = sr
    t = np.arange(n) / sr
    y = 0.1 * np.sin(2 * np.pi * 220.0 * t)
    s = yin_track_series(y, sr, frame=2048, hop=512)
    assert s.size >= 1
