import numpy as np

from calliope.schemas import VocalRackIn
from calliope.voice.engine import process_voice_unit

def test_voice_unit_demo_finite():
    rack = VocalRackIn(role="single_lead", tune_tightness=40, room_send=20, delay_throw=10)
    y, rep = process_voice_unit([], 48_000, rack, demo_hz=220.0, output_stereo=True)
    assert y.ndim == 2 and y.shape[1] == 2
    assert np.all(np.isfinite(y))
    assert rep.peak_out >= 0


def test_voice_unit_instrumental_bypass():
    rack = VocalRackIn(role="instrumental_focus")
    y, rep = process_voice_unit([], 16_000, rack, demo_hz=330.0, output_stereo=False)
    assert y.ndim == 1
    assert rep.bypassed is True
