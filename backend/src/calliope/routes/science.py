from __future__ import annotations

import numpy as np
from fastapi import APIRouter

from calliope.audio.chroma import chroma_mean_from_mag
from calliope.audio.loudness import weighted_rms_db
from calliope.audio.mfcc import mfcc_mean
from calliope.audio.onset_peaks import onset_peak_indices
from calliope.audio.onsets import spectral_flux_series
from calliope.audio.peak import true_peak_estimate
from calliope.audio.rms import integrated_rms_db
from calliope.audio.stft import stft_magnitude
from calliope.mathx.stats import spectral_centroid
from calliope.pitch.yin import yin_track_series
from calliope.schemas import (
    ScienceAutotunePlanOut,
    ScienceAutotuneRenderIn,
    ScienceBufferIn,
    ScienceChromaOut,
    ScienceFeaturesOut,
    ScienceMfccOut,
    ScienceOnsetsOut,
    SciencePitchContourOut,
    SciencePitchShiftIn,
    ScienceWaveformOut,
)
from calliope.tune.autotune_simple import retune_contour_linear
from calliope.tune.phase_vocoder import pitch_shift_phase_vocoder
from calliope.tune.scales import major_scale_midi
from calliope.tune.warp_autotune import blend_dry_wet, warp_pitch_map
from calliope.voice.band_energy import band_energy_ratios
from calliope.voice.spectral_tilt import spectral_tilt_db_per_oct
from calliope.voice.zero_crossing import zero_crossing_rate

router = APIRouter(tags=["science"])

_FRAME = 2048
_HOP = 512
_N_FFT = 512
_STFT_HOP = 160


def _waveform(body: ScienceBufferIn) -> np.ndarray:
    if body.samples:
        return np.asarray(body.samples, dtype=np.float64)
    f = float(body.demo_tone_hz or 220.0)
    n = max(1, int(body.sample_rate * 0.25))
    t = np.arange(n, dtype=np.float64) / float(body.sample_rate)
    return np.sin(2.0 * np.pi * f * t)


@router.post("/v1/science/pitch-contour", response_model=SciencePitchContourOut)
async def pitch_contour(body: ScienceBufferIn) -> SciencePitchContourOut:
    y = _waveform(body)
    sr = body.sample_rate
    f0 = yin_track_series(y, sr, frame=_FRAME, hop=_HOP)
    return SciencePitchContourOut(
        f0_hz=[float(x) for x in f0.tolist()],
        hop_samples=_HOP,
        frame_samples=_FRAME,
    )


@router.post("/v1/science/mfcc", response_model=ScienceMfccOut)
async def mfcc(body: ScienceBufferIn) -> ScienceMfccOut:
    y = _waveform(body)
    c = mfcc_mean(y, body.sample_rate, n_fft=_N_FFT, hop=_STFT_HOP)
    return ScienceMfccOut(mfcc_mean=[float(x) for x in c.tolist()], sample_rate=body.sample_rate)


@router.post("/v1/science/autotune-plan", response_model=ScienceAutotunePlanOut)
async def autotune_plan(body: ScienceBufferIn) -> ScienceAutotunePlanOut:
    y = _waveform(body)
    sr = body.sample_rate
    f0 = yin_track_series(y, sr, frame=_FRAME, hop=_HOP)
    scale = major_scale_midi(60)
    target, ratios = retune_contour_linear(f0, scale_midi=scale, smooth=0.2, pull=0.9)
    return ScienceAutotunePlanOut(
        target_hz=[float(x) for x in target.tolist()],
        ratios=[float(x) for x in ratios.tolist()],
        sample_rate=sr,
    )


@router.post("/v1/science/features", response_model=ScienceFeaturesOut)
async def features(body: ScienceBufferIn) -> ScienceFeaturesOut:
    y = _waveform(body)
    sr = body.sample_rate
    mag, _ = stft_magnitude(y, n_fft=_N_FFT, hop=_STFT_HOP, sr=sr)
    freqs = np.fft.rfftfreq(_N_FFT, 1.0 / sr)
    tilt = 0.0
    bands = (0.33, 0.33, 0.33)
    if mag.shape[0] > 0:
        m0 = mag[0]
        tilt = spectral_tilt_db_per_oct(m0, freqs)
        br = band_energy_ratios(m0, freqs, [(50, 300), (300, 3400), (3400, min(sr / 2, 12_000))])
        bands = (br[0], br[1], br[2])
    zc = zero_crossing_rate(y, frame=1024, hop=512)
    z_mean = float(np.mean(zc)) if zc.size else 0.0
    _cent = float(spectral_centroid(mag[0], freqs)) if mag.shape[0] else 0.0
    return ScienceFeaturesOut(
        integrated_rms_dbfs=float(integrated_rms_db(y)),
        weighted_rms_dbfs=float(weighted_rms_db(y, sr, n_fft=_N_FFT)),
        true_peak=float(true_peak_estimate(y)),
        zcr_mean=z_mean,
        spectral_centroid_hz=_cent,
        spectral_tilt_db_per_oct=float(tilt),
        band_low=float(bands[0]),
        band_mid=float(bands[1]),
        band_high=float(bands[2]),
        sample_rate=sr,
    )


@router.post("/v1/science/pitch-shift", response_model=ScienceWaveformOut)
async def pitch_shift(body: SciencePitchShiftIn) -> ScienceWaveformOut:
    y = _waveform(body)
    sr = body.sample_rate
    out = pitch_shift_phase_vocoder(
        y,
        sr,
        body.semitones,
        n_fft=body.n_fft,
        hop_length=body.hop_samples,
    )
    max_len = min(out.size, 480_000)
    truncated = out.size > max_len
    sl = out[:max_len]
    return ScienceWaveformOut(
        samples=[float(x) for x in sl.tolist()],
        sample_rate=sr,
        truncated=truncated,
    )


@router.post("/v1/science/autotune-render", response_model=ScienceWaveformOut)
async def autotune_render(body: ScienceAutotuneRenderIn) -> ScienceWaveformOut:
    y = _waveform(body)
    sr = body.sample_rate
    f0 = yin_track_series(y, sr, frame=_FRAME, hop=_HOP)
    scale = None if body.et_snap else major_scale_midi(body.major_root_midi)
    target, _ = retune_contour_linear(f0, scale_midi=scale, smooth=0.22, pull=0.92)
    wet = warp_pitch_map(
        y,
        sr,
        f0,
        target,
        hop=_HOP,
        frame=_FRAME,
        strength=body.warp_exponent,
        smooth_bins=7,
    )
    out = blend_dry_wet(y, wet, body.strength)
    max_len = min(int(body.max_return_samples), out.size)
    truncated = out.size > max_len
    sl = out[:max_len]
    return ScienceWaveformOut(
        samples=[float(x) for x in sl.tolist()],
        sample_rate=sr,
        truncated=truncated,
    )


@router.post("/v1/science/chroma", response_model=ScienceChromaOut)
async def chroma(body: ScienceBufferIn) -> ScienceChromaOut:
    y = _waveform(body)
    sr = body.sample_rate
    mag, _ = stft_magnitude(y, n_fft=_N_FFT, hop=_STFT_HOP, sr=sr)
    c = chroma_mean_from_mag(mag, sr, _N_FFT)
    return ScienceChromaOut(chroma=[float(x) for x in c.tolist()], sample_rate=sr)


@router.post("/v1/science/onsets", response_model=ScienceOnsetsOut)
async def onsets(body: ScienceBufferIn) -> ScienceOnsetsOut:
    y = _waveform(body)
    sr = body.sample_rate
    mag, _ = stft_magnitude(y, n_fft=_N_FFT, hop=_STFT_HOP, sr=sr)
    flux = spectral_flux_series(mag)
    if flux.size == 0:
        peaks = np.array([], dtype=np.int64)
    else:
        peaks = onset_peak_indices(flux, pre_max=2, post_max=2, delta=float(np.median(flux) * 1.5 + 1e-6))
    return ScienceOnsetsOut(
        onset_frame_indices=[int(i) for i in peaks.tolist()],
        hop_samples=_STFT_HOP,
        n_fft=_N_FFT,
    )
