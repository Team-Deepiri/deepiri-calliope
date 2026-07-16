from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal

from calliope.pitch.yin import yin_track_series_voicing
from calliope.pitch.hz_cents import hz_to_midi, midi_to_hz, snap_hz_equal_temperament
from calliope.tune.pitch_shift import pitch_shift_interpolate
from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
from calliope.tune.retune import smooth_snap_midi_contour
from calliope.tune.scales import major_scale_midi, minor_scale_midi
from calliope.tune.warp_autotune import warp_pitch_map, blend_dry_wet


ScaleType = Literal["major", "minor", "chromatic", "dorian", "mixolydian", "pentatonic"]


SCALE_INTERVALS: dict[str, list[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "chromatic": list(range(12)),
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "pentatonic": [0, 2, 4, 7, 9],
}


def build_scale_midi(root_midi: int, scale_type: str = "major") -> list[int]:
    intervals = SCALE_INTERVALS.get(scale_type, SCALE_INTERVALS["major"])
    return [root_midi + i for i in intervals]


def shift_pitch(
    samples: np.ndarray,
    sr: int,
    semitones: float,
    formant_correct: bool = False,
    method: str = "phase_vocoder",
) -> np.ndarray:
    if method == "interpolate":
        shifted = pitch_shift_interpolate(samples, semitones)
    else:
        shifted = pitch_shift_phase_vocoder(samples, sr, semitones)

    if formant_correct:
        from calliope.voice.formant_shift import formant_shift_stft
        shift_ratio = 2.0 ** (semitones / 12.0)
        shifted = formant_shift_stft(shifted, sr, shift=1.0 / shift_ratio, n_fft=1024, hop=256)
        shifted = np.clip(shifted, -1.0, 1.0)

    return shifted


def detect_pitch(
    samples: np.ndarray,
    sr: int,
    frame: int = 2048,
    hop: int = 512,
    fmin: float = 50.0,
    fmax: float = 2000.0,
) -> dict:
    f0, voicing = yin_track_series_voicing(
        samples, sr, frame=frame, hop=hop, fmin=fmin, fmax=fmax, thresh=0.15
    )
    midi_notes = np.where(f0 > 0, hz_to_midi(f0), 0.0)
    return {
        "f0_hz": f0.tolist(),
        "voicing_strength": voicing.tolist(),
        "midi_notes": midi_notes.tolist(),
        "hop_samples": hop,
        "frame_samples": frame,
    }


def correct_pitch(
    samples: np.ndarray,
    sr: int,
    scale: str = "major",
    root: int = 60,
    strength: float = 1.0,
    frame: int = 2048,
    hop: int = 512,
) -> np.ndarray:
    f0, voicing = yin_track_series_voicing(
        samples, sr, frame=frame, hop=hop, fmin=50.0, fmax=2000.0, thresh=0.15
    )
    scale_notes = build_scale_midi(root, scale)
    target_midi = smooth_snap_midi_contour(
        np.where(f0 > 0, hz_to_midi(f0), 0.0),
        voicing,
        scale_notes,
    )
    target_hz = np.where(target_midi > 0, midi_to_hz(target_midi), 0.0)
    corrected = warp_pitch_map(
        samples, sr, f0, target_hz, hop=hop, frame=frame, strength=strength, smooth_bins=5
    )
    return corrected
