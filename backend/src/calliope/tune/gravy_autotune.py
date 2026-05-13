"""Production-grade autotune with CREPE deep learning pitch detection."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

import numpy as np
from scipy.ndimage import gaussian_filter1d


class AutotuneMode(str, Enum):
    AUTO = "auto"
    HARD = "hard"
    SOFT = "soft"
    MELODIC = "melodic"


class ScaleType(str, Enum):
    MAJOR = "major"
    MINOR = "minor"
    HARMONIC_MINOR = "harmonic_minor"
    MELODIC_MINOR = "melodic_minor"
    DORIAN = "dorian"
    MIXOLYDIAN = "mixolydian"
    BLUES = "blues"
    PENTATONIC_MAJOR = "pentatonic_major"
    PENTATONIC_MINOR = "pentatonic_minor"
    CHROMATIC = "chromatic"
    ET = "equal_temperament"


@dataclass
class AutotuneConfig:
    mode: AutotuneMode = AutotuneMode.AUTO
    scale_type: ScaleType = ScaleType.MAJOR
    root_midi: int = 60
    strength: float = 1.0
    speed: float = 0.5
    rolloff_width: float = 0.1
    latency_ms: float = 10.0
    formant_correction: bool = True
    formant_preserve: float = 0.5
    pitch_quality: float = 0.8
    min_confidence: float = 0.5
    fmin_hz: float = 80.0
    fmax_hz: float = 1000.0
    retune_speed: float = 1.0
    natural_vibrato: float = 0.3
    transient_protection: float = 0.5


SCALE_INTERVALS: dict[ScaleType, list[int]] = {
    ScaleType.MAJOR: [0, 2, 4, 5, 7, 9, 11],
    ScaleType.MINOR: [0, 2, 3, 5, 7, 8, 10],
    ScaleType.HARMONIC_MINOR: [0, 2, 3, 5, 7, 8, 11],
    ScaleType.MELODIC_MINOR: [0, 2, 3, 5, 7, 9, 11],
    ScaleType.DORIAN: [0, 2, 3, 5, 7, 9, 10],
    ScaleType.MIXOLYDIAN: [0, 2, 4, 5, 7, 9, 10],
    ScaleType.BLUES: [0, 3, 5, 6, 7, 10],
    ScaleType.PENTATONIC_MAJOR: [0, 2, 4, 7, 9],
    ScaleType.PENTATONIC_MINOR: [0, 3, 5, 7, 10],
    ScaleType.CHROMATIC: list(range(12)),
    ScaleType.EQUAL_TEMPERAMENT: list(range(12)),
}


def midi_to_hz(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def hz_to_midi(hz: float) -> float:
    return 69.0 + 12.0 * np.log2(max(hz, 1e-9) / 440.0)


def get_scale_notes(scale_type: ScaleType, root_midi: int) -> np.ndarray:
    intervals = SCALE_INTERVALS.get(scale_type, SCALE_INTERVALS[ScaleType.MAJOR])
    notes = []
    for octave in range(11):
        for interval in intervals:
            notes.append(root_midi + (octave * 12) + interval)
    return np.array(sorted(set(notes)), dtype=np.float64)


def snap_to_scale(midi_value: float, scale_notes: np.ndarray, strength: float = 1.0) -> float:
    if strength < 1e-9:
        return midi_value
    nearest = scale_notes[np.argmin(np.abs(scale_notes - midi_value))]
    return nearest + (midi_value - nearest) * (1.0 - strength)


def crepe_pitch_track(
    y: np.ndarray,
    sr: int,
    model_capacity: str = "full",
    frame_length: float = 0.05,
    hop_length: int | None = None,
    viterbi: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Use CREPE for deep learning pitch detection.
    
    Returns (f0_hz, confidence, activation).
    """
    try:
        from crepe import predict
    except ImportError:
        return None, None, None

    if hop_length is None:
        hop_length = int(sr * frame_length)

    frequency, confidence, activation, _ = predict(
        y,
        sr,
        model_capacity=model_capacity,
        viterbi=viterbi,
        center=True,
        step_size=int(frame_length * 1000),
    )

    return np.array(frequency), np.array(confidence), activation


def yin_pitch_track(
    y: np.ndarray,
    sr: int,
    frame_length: int = 2048,
    hop_length: int = 512,
    fmin: float = 80.0,
    fmax: float = 1000.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Fallback YIN pitch tracking using existing calliope implementation.
    """
    from calliope.pitch.yin import yin_track_series
    
    f0 = yin_track_series(y, sr, frame=frame_length, hop=hop_length, fmin=fmin, fmax=fmax)
    confidence = np.ones_like(f0)
    confidence[f0 < fmin] = 0.0
    return f0, confidence


@dataclass
class AutotuneResult:
    corrected_samples: np.ndarray
    original_f0: np.ndarray
    corrected_f0: np.ndarray
    confidence: np.ndarray
    correction_amount_cents: np.ndarray
    scale_notes: np.ndarray


def apply_psola(
    y: np.ndarray,
    sr: int,
    f0_contour: np.ndarray,
    target_f0: np.ndarray,
    frame_length: int = 2048,
    hop_length: int = 512,
    strength: float = 1.0,
) -> np.ndarray:
    """
    PSOLA-style pitch correction.
    For each frame, synthesize with period from target F0.
    """
    from calliope.tune.warp_autotune import warp_pitch_map
    
    return warp_pitch_map(
        y, sr, f0_contour, target_f0,
        hop=hop_length, frame=frame_length,
        strength=strength, smooth_bins=8
    )


def phase_vocoder_pitch_shift(
    y: np.ndarray,
    sr: int,
    semitones: float,
    n_fft: int = 4096,
    hop_length: int = 512,
) -> np.ndarray:
    """
    Phase vocoder-based pitch shift with high quality.
    """
    from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
    
    return pitch_shift_phase_vocoder(
        y, sr, semitones,
        n_fft=n_fft, hop_length=hop_length
    )


def auto_tune(
    samples: np.ndarray,
    sr: int,
    config: AutotuneConfig | None = None,
    scale_notes: np.ndarray | None = None,
) -> AutotuneResult:
    """
    Production-grade autotune with multiple detection/correction strategies.
    """
    if config is None:
        config = AutotuneConfig()

    y = np.asarray(samples, dtype=np.float64).ravel()
    n = y.size

    f0, confidence, activation = crepe_pitch_track(
        y, sr,
        model_capacity="full" if config.pitch_quality > 0.5 else "tiny",
        frame_length=0.02,
    )

    if f0 is None:
        f0, confidence = yin_pitch_track(
            y, sr,
            frame_length=2048,
            hop_length=512,
            fmin=config.fmin_hz,
            fmax=config.fmax_hz,
        )

    f0 = np.nan_to_num(f0, nan=0.0)
    f0[f0 <= 0] = 0.0
    confidence = np.clip(confidence, 0.0, 1.0)

    weighted_f0 = f0.copy()
    high_conf = confidence > config.min_confidence
    weighted_f0[~high_conf] = 0.0

    if scale_notes is None:
        scale_notes = get_scale_notes(config.scale_type, config.root_midi)

    target_f0 = np.zeros_like(f0)
    midi_contour = hz_to_midi(weighted_f0)
    
    for i in range(len(midi_contour)):
        if weighted_f0[i] > 0:
            snapped = snap_to_scale(midi_contour[i], scale_notes, strength=config.strength)
            target_f0[i] = midi_to_hz(snapped)
        else:
            target_f0[i] = 0.0

    target_f0 = gaussian_filter1d(target_f0, sigma=2.0 * (1.0 - config.natural_vibrato))

    correction_cents = np.zeros_like(f0)
    valid = (f0 > 0) & (target_f0 > 0)
    correction_cents[valid] = 1200.0 * np.log2(f0[valid] / target_f0[valid])
    correction_cents[~valid] = 0.0

    speed_factor = 1.0 - (config.speed * 0.5)
    correction_amount = np.clip(correction_cents * speed_factor * config.strength, -1200, 1200)

    target_for_correction = f0.copy()
    for i in range(len(target_for_correction)):
        if f0[i] > 0 and correction_amount[i] != 0:
            cents = correction_amount[i]
            semitones = cents / 100.0
            target_for_correction[i] = f0[i] * (2.0 ** (semitones / 12.0))

    target_for_correction = np.clip(target_for_correction, config.fmin_hz * 0.5, config.fmax_hz * 2.0)

    strength_factor = config.strength * (1.0 + config.speed * 0.5)
    
    if config.mode == AutotuneMode.HARD:
        strength_factor = 1.0
    elif config.mode == AutotuneMode.SOFT:
        strength_factor *= 0.6
    elif config.mode == AutotuneMode.MELODIC:
        strength_factor *= 0.8

    corrected = apply_psola(
        y, sr,
        f0, target_for_correction,
        frame_length=2048, hop_length=512,
        strength=strength_factor,
    )

    if config.formant_correction and config.formant_preserve > 0:
        from calliope.voice.formant_shift import formant_shift_stft
        
        formant_shift = 1.0 + (correction_cents / 1200.0) * (1.0 - config.formant_preserve)
        formant_shift = np.clip(formant_shift, 0.5, 2.0)
        avg_shift = float(np.median(formant_shift[valid])) if valid.any() else 1.0
        
        if abs(avg_shift - 1.0) > 0.02:
            corrected = formant_shift_stft(corrected, sr, shift=avg_shift, n_fft=1024, hop=256)
            corrected = np.clip(corrected, -1.0, 1.0)

    return AutotuneResult(
        corrected_samples=corrected.astype(np.float64),
        original_f0=f0,
        corrected_f0=target_for_correction,
        confidence=confidence,
        correction_amount_cents=correction_cents,
        scale_notes=scale_notes,
    )


def analyze_pitch_accuracy(
    original_f0: np.ndarray,
    target_f0: np.ndarray,
    confidence: np.ndarray,
) -> dict:
    """
    Analyze how close original was to target.
    """
    valid = (original_f0 > 0) & (target_f0 > 0) & (confidence > 0.5)
    
    if not valid.any():
        return {"accuracy_percent": 0.0, "avg_error_cents": 0.0, "in_tune_frames": 0}

    error_cents = 1200.0 * np.log2(original_f0[valid] / target_f0[valid])
    error_cents = np.abs(error_cents)
    
    in_tune = (error_cents < 15.0).sum()
    accuracy = in_tune / valid.sum() * 100.0

    return {
        "accuracy_percent": float(accuracy),
        "avg_error_cents": float(error_cents.mean()),
        "max_error_cents": float(error_cents.max()),
        "in_tune_frames": int(in_tune),
        "total_frames": int(valid.sum()),
    }