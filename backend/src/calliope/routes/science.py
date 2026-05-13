from __future__ import annotations

import numpy as np
from fastapi import APIRouter

from calliope.audio.loudness import weighted_rms_db
from calliope.audio.mfcc import mfcc_mean
from calliope.audio.peak import true_peak_estimate
from calliope.audio.rms import integrated_rms_db
from calliope.audio.stft import stft_magnitude
from calliope.mathx.stats import spectral_centroid
from calliope.pitch.yin import yin_track_series
from calliope.schemas import (
    ScienceAutotunePlanOut,
    ScienceBufferIn,
    ScienceFeaturesOut,
    ScienceMfccOut,
    SciencePitchContourOut,
)
from calliope.tune.autotune_simple import retune_contour_linear
from calliope.tune.scales import major_scale_midi
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
