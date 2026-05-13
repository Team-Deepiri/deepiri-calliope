import numpy as np

from calliope.tune.warp_autotune import warp_pitch_map


def test_warp_identity_when_targets_match_f0():
    sr = 16_000
    n = 8000
    t = np.arange(n) / sr
    y = 0.2 * np.sin(2 * np.pi * 220.0 * t)
    hop, frame = 512, 2048
    n_frames = (n - frame) // hop + 1
    f0 = np.full(n_frames, 220.0)
    tgt = np.full(n_frames, 220.0)
    z = warp_pitch_map(y, sr, f0, tgt, hop=hop, frame=frame, strength=1.0, smooth_bins=1)
    assert z.shape == y.shape
    assert np.sqrt(np.mean((y - z) ** 2)) < 0.02
