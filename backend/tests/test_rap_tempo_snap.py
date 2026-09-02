import numpy as np

from calliope.audio.beat_sync import stretch_to_tempo, trim_leading_silence, TempoDetector


def test_trim_leading_silence_drops_quiet_prefix():
    sr = 48_000
    silence = np.zeros(int(0.4 * sr))
    tone = 0.2 * np.sin(2 * np.pi * 220 * np.arange(int(0.3 * sr)) / sr)
    y = np.concatenate([silence, tone])
    out = trim_leading_silence(y, sr, max_trim_sec=1.0)
    assert len(out) < len(y)
    assert len(out) > len(tone) * 0.8


def test_stretch_to_tempo_changes_length():
    sr = 48_000
    y = 0.1 * np.sin(2 * np.pi * 180 * np.arange(sr) / sr)
    out, did = stretch_to_tempo(y, sr, from_bpm=100.0, to_bpm=120.0)
    assert did
    # 100→120 should shorten (~0.83x)
    assert 0.75 * len(y) < len(out) < 0.95 * len(y)


def test_stretch_skips_tiny_ratio():
    sr = 48_000
    y = np.random.randn(sr).astype(np.float64) * 0.05
    out, did = stretch_to_tempo(y, sr, from_bpm=120.0, to_bpm=121.0)
    assert not did
    assert len(out) == len(y)


def test_tempo_detector_runs_on_click_train():
    sr = 48_000
    bpm = 120.0
    period = int(sr * 60.0 / bpm)
    y = np.zeros(period * 16)
    for i in range(16):
        start = i * period
        y[start : start + 80] = 0.9
    detected, conf = TempoDetector(sr).detect_bpm(y, prefer_bpm=120)
    assert 90 <= detected <= 150
    assert conf >= 0.0  # smoke: detector returns finite confidence
    assert np.isfinite(detected)
