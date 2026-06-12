"""Multi-band parametric EQ with biquad filters."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal
from scipy.signal import iirpeak, iirnotch, butter, sosfilt


@dataclass
class EQBand:
    frequency: float
    gain: float
    q: float = 1.0
    band_type: Literal["low_shelf", "high_shelf", "peaking", "high_pass", "low_pass"] = "peaking"
    enabled: bool = True


@dataclass
class EQPreset:
    name: str
    bands: list[EQBand] = field(default_factory=list)


EQ_PRESETS: dict[str, list[EQBand]] = {
    "vocal_warm": [
        EQBand(80, -3.0, 0.7, "high_pass"),
        EQBand(300, 2.5, 0.8, "low_shelf"),
        EQBand(3000, 3.0, 1.2, "peaking"),
        EQBand(8000, 1.5, 0.7, "high_shelf"),
        EQBand(200, -1.0, 0.6, "peaking"),
    ],
    "bass_boost": [
        EQBand(60, 5.0, 0.5, "low_shelf"),
        EQBand(120, 3.0, 1.0, "peaking"),
        EQBand(400, -2.0, 0.8, "peaking"),
        EQBand(2000, -1.0, 0.7, "peaking"),
    ],
    "bright": [
        EQBand(200, -2.0, 0.6, "high_pass"),
        EQBand(5000, 4.0, 0.8, "high_shelf"),
        EQBand(10000, 3.0, 1.0, "peaking"),
        EQBand(150, -1.5, 0.7, "peaking"),
    ],
    "telephone": [
        EQBand(300, 0.0, 0.5, "high_pass"),
        EQBand(3400, 0.0, 0.5, "low_pass"),
        EQBand(1000, 3.0, 2.0, "peaking"),
        EQBand(200, -12.0, 1.0, "peaking"),
        EQBand(4000, -12.0, 1.0, "peaking"),
    ],
    "flat": [],
}


class ParametricEQ:
    """Multi-band parametric equalizer using biquad filters applied in series."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.bands: list[EQBand] = []
        self._sos_cache: list[np.ndarray] | None = None

    def add_band(self, band: EQBand) -> None:
        self.bands.append(band)
        self._sos_cache = None

    def remove_band(self, index: int) -> None:
        if 0 <= index < len(self.bands):
            self.bands.pop(index)
            self._sos_cache = None

    def low_shelf(self, frequency: float, gain: float, q: float = 0.707) -> EQBand:
        band = EQBand(frequency, gain, q, "low_shelf")
        self.add_band(band)
        return band

    def high_shelf(self, frequency: float, gain: float, q: float = 0.707) -> EQBand:
        band = EQBand(frequency, gain, q, "high_shelf")
        self.add_band(band)
        return band

    def peaking(self, frequency: float, gain: float, q: float = 1.0) -> EQBand:
        band = EQBand(frequency, gain, q, "peaking")
        self.add_band(band)
        return band

    def high_pass(self, frequency: float, q: float = 0.707) -> EQBand:
        band = EQBand(frequency, 0.0, q, "high_pass")
        self.add_band(band)
        return band

    def low_pass(self, frequency: float, q: float = 0.707) -> EQBand:
        band = EQBand(frequency, 0.0, q, "low_pass")
        self.add_band(band)
        return band

    def _design_sos(self) -> list[np.ndarray]:
        if self._sos_cache is not None:
            return self._sos_cache

        nyq = self.sr / 2.0
        sos_list: list[np.ndarray] = []

        for band in self.bands:
            if not band.enabled:
                continue
            freq = band.frequency
            gain_db = band.gain
            q = band.q
            w = freq / nyq

            if w <= 0 or w >= 1:
                continue

            if band.band_type == "peaking":
                if gain_db >= 0:
                    b, a = iirpeak(freq, q, self.sr)
                else:
                    b, a = iirnotch(freq, q, self.sr)
                g = 10 ** (gain_db / 40.0)
                b = b * g
                sos = np.concatenate([b, a])[np.newaxis, :]
            elif band.band_type == "low_shelf":
                soc = _low_shelf_coeffs(freq, gain_db, q, self.sr)
                sos = np.array([soc], dtype=np.float64)
            elif band.band_type == "high_shelf":
                soc = _high_shelf_coeffs(freq, gain_db, q, self.sr)
                sos = np.array([soc], dtype=np.float64)
            elif band.band_type == "high_pass":
                sos = butter(2, w, btype="high", output="sos")
            elif band.band_type == "low_pass":
                sos = butter(2, w, btype="low", output="sos")
            else:
                continue

            sos_list.append(sos)

        self._sos_cache = sos_list
        return sos_list

    def process(self, samples: np.ndarray) -> np.ndarray:
        """Apply all EQ bands in series."""
        output = samples.copy().astype(np.float64)
        for sos in self._design_sos():
            output = sosfilt(sos, output, axis=0)
        return output

    def load_preset(self, name: str) -> list[EQBand]:
        """Load a built-in EQ preset, clearing current bands."""
        if name not in EQ_PRESETS:
            raise ValueError(f"Unknown preset: {name}. Available: {list(EQ_PRESETS.keys())}")
        self.bands = [EQBand(b.frequency, b.gain, b.q, b.band_type) for b in EQ_PRESETS[name]]
        self._sos_cache = None
        return self.bands

    def visualize(self, n_points: int = 512) -> dict:
        """Compute frequency response curve data as (frequencies, magnitudes_db)."""
        freqs = np.logspace(np.log10(20), np.log10(20000), n_points)
        magnitude = np.ones(n_points, dtype=np.float64)

        sos_list = self._design_sos()
        if not sos_list:
            return {"frequencies": freqs.tolist(), "magnitudes_db": np.zeros(n_points).tolist()}

        for sos in sos_list:
            w = freqs / (self.sr / 2.0)
            w = np.clip(w, 1e-8, 1.0 - 1e-8)
            for section in sos:
                b0, b1, b2, a0, a1, a2 = section
                s = 1j * w
                h = (b0 * s ** 2 + b1 * s + b2) / (a0 * s ** 2 + a1 * s + a2)
                magnitude *= np.abs(h)

        magnitude_db = 20 * np.log10(np.clip(magnitude, 1e-10, None))
        return {
            "frequencies": freqs.tolist(),
            "magnitudes_db": magnitude_db.tolist(),
        }


def _low_shelf_coeffs(freq: float, gain_db: float, q: float, sr: int) -> tuple[float, ...]:
    """Design low-shelf biquad coefficients (RBJ cookbook)."""
    a = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * freq / sr
    sin_w0 = np.sin(w0)
    cos_w0 = np.cos(w0)
    alpha = sin_w0 / (2 * q)
    beta = np.sqrt(a) / q

    b0 = a * ((a + 1) - (a - 1) * cos_w0 + beta * sin_w0)
    b1 = 2 * a * ((a - 1) - (a + 1) * cos_w0)
    b2 = a * ((a + 1) - (a - 1) * cos_w0 - beta * sin_w0)
    a0 = (a + 1) + (a - 1) * cos_w0 + beta * sin_w0
    a1 = -2 * ((a - 1) + (a + 1) * cos_w0)
    a2 = (a + 1) + (a - 1) * cos_w0 - beta * sin_w0

    return b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0


def _high_shelf_coeffs(freq: float, gain_db: float, q: float, sr: int) -> tuple[float, ...]:
    """Design high-shelf biquad coefficients (RBJ cookbook)."""
    a = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * freq / sr
    sin_w0 = np.sin(w0)
    cos_w0 = np.cos(w0)
    beta = np.sqrt(a) / q

    b0 = a * ((a + 1) + (a - 1) * cos_w0 + beta * sin_w0)
    b1 = -2 * a * ((a - 1) + (a + 1) * cos_w0)
    b2 = a * ((a + 1) + (a - 1) * cos_w0 - beta * sin_w0)
    a0 = (a + 1) - (a - 1) * cos_w0 + beta * sin_w0
    a1 = 2 * ((a - 1) - (a + 1) * cos_w0)
    a2 = (a + 1) - (a - 1) * cos_w0 - beta * sin_w0

    return b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0
