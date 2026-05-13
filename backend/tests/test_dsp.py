import numpy as np

from calliope.dsp import frame_signal, hann_window, overlap_add, preemphasis


def test_hann_symmetric():
    w = hann_window(64)
    assert len(w) == 64
    assert np.allclose(w[0], 0.0, atol=1e-6)
    assert w.max() <= 1.0


def test_frame_unframe_roundtrip_shape():
    x = np.random.default_rng(0).normal(size=1000)
    fl, hop = 128, 64
    frames = frame_signal(x, fl, hop)
    assert frames.shape[1] == fl
    y = overlap_add(frames, hop, hann_window(fl))
    n_frames = frames.shape[0]
    expected = (n_frames - 1) * hop + fl if n_frames else 0
    assert len(y) == expected


def test_preemphasis():
    x = np.array([1.0, 2.0, 3.0])
    y = preemphasis(x, 0.5)
    assert y[0] == 1.0
    assert abs(y[1] - 1.5) < 1e-9
