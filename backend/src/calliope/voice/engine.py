"""Calliope Voice Unit — full in-the-box vocal chain (numpy/scipy, real-time friendly structure)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal

from calliope.audio.rms import integrated_rms_db
from calliope.pitch.yin import yin_track_series
from calliope.schemas import VocalRackIn
from calliope.tune.autotune_simple import retune_contour_linear
from calliope.tune.warp_autotune import blend_dry_wet, warp_pitch_map
from calliope.voice import biquad, deesser, delay_fx, dynamics, formant_shift, gate, mapper, reverb, saturation, stereo_fx, tilt


@dataclass
class VoiceProcessReport:
    rms_in_dbfs: float
    rms_out_dbfs: float
    peak_in: float
    peak_out: float
    bypassed: bool


def _demo_sine(sr: int, hz: float, seconds: float = 0.35) -> np.ndarray:
    n = max(1, int(sr * seconds))
    t = np.arange(n, dtype=np.float64) / float(sr)
    return np.sin(2.0 * np.pi * float(hz) * t).astype(np.float64)


def process_voice_unit(
    samples: list[float] | np.ndarray,
    sr: int,
    rack: VocalRackIn,
    *,
    demo_hz: float | None = 220.0,
    output_stereo: bool = True,
) -> tuple[np.ndarray, VoiceProcessReport]:
    """
    Run the Calliope Voice Unit on mono audio.

    Returns `(y, report)`. If `output_stereo`, `y` has shape `(n, 2)`; else `(n,)`.
    """
    if len(samples) > 0:
        dry = np.asarray(samples, dtype=np.float64).ravel()
    else:
        dry = _demo_sine(sr, float(demo_hz or 220.0))
    if dry.size == 0:
        rep = VoiceProcessReport(-120.0, -120.0, 0.0, 0.0, True)
        empty = np.zeros((0, 2), dtype=np.float64) if output_stereo else np.zeros(0, dtype=np.float64)
        return empty, rep

    p = mapper.rack_to_params(rack)
    peak_in = float(np.max(np.abs(dry)))
    rms_in = integrated_rms_db(dry)

    if p.bypass_chain:
        y = dry.copy()
        y = dynamics.soft_limiter(y, threshold=0.96, knee=0.06)
        out = (
            stereo_fx.stereo_widen_mono(y, float(sr), width=0.08, haas_ms=0.0, chorus_amount=0.0)
            if output_stereo
            else y
        )
        rms_out = integrated_rms_db(out[:, 0] if out.ndim == 2 else out)
        peak_out = float(np.max(np.abs(out)))
        return out, VoiceProcessReport(
            rms_in_dbfs=rms_in,
            rms_out_dbfs=rms_out,
            peak_in=peak_in,
            peak_out=peak_out,
            bypassed=True,
        )

    y = signal.sosfilt(biquad.sos_highpass(float(sr), p.hp_hz, order=2), dry)
    y = tilt.tone_tilt(y, float(sr), body_db=p.body_db, air_db=p.air_db)
    if abs(p.presence_db) > 0.35:
        sos = biquad.sos_presence_peak(float(sr), 3200.0, 1.1, p.presence_db)
        y = signal.sosfilt(sos, y)
    if abs(p.brilliance_extra_db) > 0.35:
        sos_hi = biquad.sos_presence_peak(float(sr), 9800.0, 0.85, p.brilliance_extra_db * 0.65)
        y = signal.sosfilt(sos_hi, y)
    y = gate.noise_gate(y, float(sr), threshold_db=p.gate_threshold_db)
    y = dynamics.compressor_mono(
        y,
        float(sr),
        threshold_db=p.comp_threshold_db,
        ratio=p.comp_ratio,
        makeup_db=p.comp_makeup_db,
        attack_ms=p.comp_attack_ms,
        release_ms=p.comp_release_ms,
    )
    y = deesser.deesser_mono(y, float(sr), amount=p.deesser_amount)

    if p.tune_blend > 0.04:
        f0 = yin_track_series(y, sr, frame=2048, hop=512, fmin=70.0, fmax=900.0)
        target, _ = retune_contour_linear(f0, scale_midi=None, smooth=0.18, pull=0.88)
        tuned = warp_pitch_map(y, float(sr), f0, target, hop=512, frame=2048, strength=0.95, smooth_bins=6)
        y = blend_dry_wet(y, tuned, p.tune_blend)

    if abs(p.formant_shift - 1.0) > 0.02:
        yf = formant_shift.formant_shift_stft(y, sr, shift=p.formant_shift, n_fft=1024, hop=256)
        fb = float(min(0.8, abs(p.formant_shift - 1.0) * 4.0))
        y = blend_dry_wet(y, yf, fb)

    y = saturation.tape_tube_saturation(y, p.drive, mix=0.92)
    if p.parallel_grit > 0.02:
        hp_sos = biquad.sos_highpass(float(sr), 900.0, order=2)
        grit_src = signal.sosfilt(hp_sos, dry)
        grit = dynamics.compressor_mono(
            grit_src,
            float(sr),
            threshold_db=-34.0,
            ratio=6.0,
            makeup_db=2.0,
            attack_ms=3.0,
            release_ms=80.0,
        )
        grit = saturation.tape_tube_saturation(grit, min(2.8, p.drive + 0.8), mix=1.0)
        y = blend_dry_wet(y, grit, p.parallel_grit)

    wet_r = reverb.schroeder_reverb_mono(y, float(sr), wet=p.reverb_wet, t60=p.reverb_t60)
    wet_d = delay_fx.feedback_delay_mono(y, float(sr), time_ms=p.delay_ms, feedback=p.delay_feedback, wet=p.delay_wet)
    y = y + wet_r + wet_d
    y = dynamics.soft_limiter(y, threshold=0.94, knee=0.09)

    rms_out = integrated_rms_db(y)
    peak_out = float(np.max(np.abs(y)))

    if output_stereo:
        out = stereo_fx.stereo_widen_mono(
            y,
            float(sr),
            width=p.width,
            haas_ms=p.haas_ms,
            chorus_amount=p.chorus_amount,
        )
    else:
        out = y

    if out.ndim == 2:
        rms_out = integrated_rms_db(out[:, 0])
        peak_out = max(peak_out, float(np.max(np.abs(out))))

    return out.astype(np.float64), VoiceProcessReport(
        rms_in_dbfs=rms_in,
        rms_out_dbfs=rms_out,
        peak_in=peak_in,
        peak_out=peak_out,
        bypassed=False,
    )


def report_to_metrics(rep: VoiceProcessReport) -> dict[str, float]:
    return {
        "rms_in_dbfs": float(rep.rms_in_dbfs),
        "rms_out_dbfs": float(rep.rms_out_dbfs),
        "peak_in": float(rep.peak_in),
        "peak_out": float(rep.peak_out),
        "bypassed": 1.0 if rep.bypassed else 0.0,
        "loudness_delta_db": float(rep.rms_out_dbfs - rep.rms_in_dbfs),
    }
