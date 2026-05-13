"""Multi-band dynamics processor (3-4 band compressor/limiter/expander)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import signal


@dataclass
class BandConfig:
    name: str
    low_freq: float
    high_freq: float
    threshold_db: float = -20.0
    ratio: float = 4.0
    attack_ms: float = 10.0
    release_ms: float = 100.0
    knee_db: float = 6.0
    makeup_db: float = 0.0
    bypass: bool = False


class MultiBandProcessor:
    """
    3-4 band multi-band dynamics processor.
    Each band has its own compressor with crossover filtering.
    """

    def __init__(
        self,
        sr: int = 48000,
        num_bands: int = 4,
        crossover_freqs: list[float] | None = None,
    ):
        self.sr = sr
        self.num_bands = num_bands
        
        if crossover_freqs is None:
            crossover_freqs = [200.0, 800.0, 4000.0]
        
        self.crossover_freqs = sorted(crossover_freqs)[:num_bands - 1]
        
        self.bands: list[BandConfig] = []
        for i in range(num_bands):
            if i == 0:
                self.bands.append(BandConfig(
                    name=f"Band {i+1} (Sub)",
                    low_freq=20.0,
                    high_freq=self.crossover_freqs[0] if self.crossover_freqs else 200.0,
                ))
            elif i == num_bands - 1:
                self.bands.append(BandConfig(
                    name=f"Band {i+1} (Air)",
                    low_freq=self.crossover_freqs[-1] if self.crossover_freqs else 4000.0,
                    high_freq=20000.0,
                ))
            else:
                self.bands.append(BandConfig(
                    name=f"Band {i+1}",
                    low_freq=self.crossover_freqs[i - 1],
                    high_freq=self.crossover_freqs[i],
                ))
        
        self._crossover_sos: list[np.ndarray] = []
        self._build_crossovers()
        
        self._envelopes: list[float] = [0.0] * num_bands

    def _build_crossovers(self) -> None:
        """Build Linkwitz-Riley crossover filters."""
        self._crossover_sos = []
        
        edges = [20.0] + self.crossover_freqs + [20000.0]
        
        for i in range(self.num_bands):
            low = edges[i]
            high = edges[i + 1]
            
            if i == 0:
                sos_low = signal.butter(4, high, btype='low', output='sos', fs=self.sr)
                sos_band = sos_low
            elif i == self.num_bands - 1:
                sos_high = signal.butter(4, low, btype='high', output='sos', fs=self.sr)
                sos_band = sos_high
            else:
                sos_low = signal.butter(4, low, btype='high', output='sos', fs=self.sr)
                sos_high = signal.butter(4, high, btype='low', output='sos', fs=self.sr)
                
                combined = np.concatenate([sos_low, sos_high])
                sos_band = combined
            
            self._crossover_sos.append(sos_band)

    def _get_crossover_filters(self) -> list[tuple[np.ndarray, np.ndarray]]:
        """Get filter coefficients for each band."""
        filters = []
        
        edges = [20.0] + self.crossover_freqs + [20000.0]
        
        prev_sos = None
        for i in range(self.num_bands):
            low = edges[i]
            high = edges[i + 1]
            
            if i == 0:
                sos_low = signal.butter(4, high, btype='low', output='sos', fs=self.sr)
                filters.append((sos_low, None))
            elif i == self.num_bands - 1:
                sos_high = signal.butter(4, low, btype='high', output='sos', fs=self.sr)
                filters.append((None, sos_high))
            else:
                sos_low = signal.butter(4, low, btype='high', output='sos', fs=self.sr)
                sos_high = signal.butter(4, high, btype='low', output='sos', fs=self.sr)
                filters.append((sos_low, sos_high))
        
        return filters

    def split_bands(self, y: np.ndarray) -> list[np.ndarray]:
        """Split audio into frequency bands."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        bands = []
        filters = self._get_crossover_filters()
        
        if self.num_bands == 3:
            low_sos = signal.butter(4, self.crossover_freqs[0], btype='low', output='sos', fs=self.sr)
            mid_sos = signal.butter(4, [self.crossover_freqs[0], self.crossover_freqs[1]], btype='band', output='sos', fs=self.sr)
            high_sos = signal.butter(4, self.crossover_freqs[1], btype='high', output='sos', fs=self.sr)
            
            bands.append(signal.sosfilt(low_sos, y))
            bands.append(signal.sosfilt(mid_sos, y))
            bands.append(signal.sosfilt(high_sos, y))
        elif self.num_bands == 4:
            sos1 = signal.butter(4, self.crossover_freqs[0], btype='low', output='sos', fs=self.sr)
            sos2 = signal.butter(4, [self.crossover_freqs[0], self.crossover_freqs[1]], btype='band', output='sos', fs=self.sr)
            sos3 = signal.butter(4, [self.crossover_freqs[1], self.crossover_freqs[2]], btype='band', output='sos', fs=self.sr)
            sos4 = signal.butter(4, self.crossover_freqs[2], btype='high', output='sos', fs=self.sr)
            
            bands.append(signal.sosfilt(sos1, y))
            bands.append(signal.sosfilt(sos2, y))
            bands.append(signal.sosfilt(sos3, y))
            bands.append(signal.sosfilt(sos4, y))
        else:
            edges = [20.0] + self.crossover_freqs + [20000.0]
            for i in range(self.num_bands):
                if i == 0:
                    sos = signal.butter(4, edges[i + 1], btype='low', output='sos', fs=self.sr)
                elif i == self.num_bands - 1:
                    sos = signal.butter(4, edges[i], btype='high', output='sos', fs=self.sr)
                else:
                    sos = signal.butter(4, [edges[i], edges[i + 1]], btype='band', output='sos', fs=self.sr)
                bands.append(signal.sosfilt(sos, y))
        
        return bands

    def _compressor_curve(
        self,
        input_level_db: float,
        threshold_db: float,
        ratio: float,
        knee_db: float,
    ) -> float:
        """Compute compressor gain reduction."""
        if knee_db > 0:
            knee_start = threshold_db - knee_db / 2
            knee_end = threshold_db + knee_db / 2
            
            if input_level_db <= knee_start:
                return 0.0
            elif input_level_db >= knee_end:
                return (1.0 - 1.0 / ratio) * (input_level_db - threshold_db)
            else:
                x = (input_level_db - knee_start) / knee_db
                return (1.0 - 1.0 / ratio) * (knee_db / 2) * x ** 2
        else:
            if input_level_db <= threshold_db:
                return 0.0
            else:
                return (1.0 - 1.0 / ratio) * (input_level_db - threshold_db)

    def process_band(self, band: np.ndarray, config: BandConfig, envelope: float) -> tuple[np.ndarray, float]:
        """Process a single band with dynamics processing."""
        if config.bypass:
            return band, envelope
        
        rms = np.sqrt(np.mean(band ** 2))
        level_db = -60.0 if rms < 1e-6 else 20.0 * np.log10(rms)
        
        attack_coef = np.exp(-1.0 / (config.attack_ms * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (config.release_ms * self.sr / 1000.0))
        
        if level_db > envelope:
            envelope = attack_coef * envelope + (1.0 - attack_coef) * level_db
        else:
            envelope = release_coef * envelope + (1.0 - release_coef) * level_db
        
        gain_reduction = self._compressor_curve(envelope, config.threshold_db, config.ratio, config.knee_db)
        
        gain_linear = 10 ** (-gain_reduction / 20.0)
        processed = band * gain_linear
        
        if config.makeup_db > 0:
            makeup_linear = 10 ** (config.makeup_db / 20.0)
            processed = processed * makeup_linear
        
        return processed, envelope

    def process(self, y: np.ndarray) -> np.ndarray:
        """Process audio through all bands."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        bands = self.split_bands(y)
        
        processed_bands = []
        new_envelopes = []
        
        for i, (band, config) in enumerate(zip(bands, self.bands)):
            proc, env = self.process_band(band, config, self._envelopes[i] if i < len(self._envelopes) else 0.0)
            processed_bands.append(proc)
            new_envelopes.append(env)
        
        self._envelopes = new_envelopes
        
        output = sum(processed_bands)
        
        peak = np.max(np.abs(output))
        if peak > 0.99:
            output = output * 0.99 / peak
        
        return output.astype(np.float64)

    def set_band_params(self, band_index: int, **params) -> None:
        """Update parameters for a specific band."""
        if 0 <= band_index < len(self.bands):
            for key, value in params.items():
                if hasattr(self.bands[band_index], key):
                    setattr(self.bands[band_index], key, value)

    def get_band_gains(self) -> list[float]:
        """Get current gain reduction for each band in dB."""
        gains = []
        for i, (config, env) in enumerate(zip(self.bands, self._envelopes)):
            if config.bypass:
                gains.append(0.0)
            else:
                gain = self._compressor_curve(env, config.threshold_db, config.ratio, config.knee_db)
                gains.append(-gain)
        return gains

    def reset(self) -> None:
        """Reset all envelope followers."""
        self._envelopes = [0.0] * self.num_bands


@dataclass
class DeEsserConfig:
    frequency: float = 6000.0
    bandwidth: float = 2000.0
    threshold_db: float = -15.0
    ratio: float = 4.0
    ceiling_db: float = -6.0


class ProfessionalDeEsser:
    """Multi-band de-esser with frequency-specific detection."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = DeEsserConfig()
        self._envelope = 0.0

    def _build_detector_filter(self) -> np.ndarray:
        """Build bandpass filter for sibilance detection."""
        return signal.butter(
            4,
            [self.config.frequency - self.config.bandwidth / 2,
             self.config.frequency + self.config.bandwidth / 2],
            btype='band',
            output='sos',
            fs=self.sr
        )

    def process(self, y: np.ndarray) -> np.ndarray:
        """Process audio with de-essing."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        detector = self._build_detector_filter()
        detected = signal.sosfilt(detector, y)
        
        rms = np.sqrt(np.mean(detected ** 2))
        level_db = -60.0 if rms < 1e-6 else 20.0 * np.log10(rms)
        
        attack_coef = np.exp(-1.0 / (1.0 * self.sr / 1000.0))
        release_coef = np.exp(-1.0 / (50.0 * self.sr / 1000.0))
        
        if level_db > self._envelope:
            self._envelope = attack_coef * self._envelope + (1.0 - attack_coef) * level_db
        else:
            self._envelope = release_coef * self._envelope + (1.0 - release_coef) * level_db
        
        if self._envelope < self.config.threshold_db:
            return y
        
        reduction = min(1.0, (self._envelope - self.config.threshold_db) * (1.0 - 1.0 / self.config.ratio) / 30.0)
        
        gain = 1.0 - reduction * 0.8
        
        return (y * gain).astype(np.float64)

    def reset(self) -> None:
        self._envelope = 0.0