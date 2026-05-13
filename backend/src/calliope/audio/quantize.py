"""Audio quantization and grid snapping for rhythmic alignment."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np
from scipy import signal


class GridDivision(str, Enum):
    WHOLE = "1/1"
    HALF = "1/2"
    QUARTER = "1/4"
    EIGHTH = "1/8"
    SIXTEENTH = "1/16"
    THIRTY_SECOND = "1/32"
    DOTTED_QUARTER = "1/4D"
    DOTTED_EIGHTH = "1/8D"
    TRIPLET_EIGHTH = "1/8T"
    TRIPLET_SIXTEENTH = "1/16T"


@dataclass
class QuantizeConfig:
    grid: GridDivision = GridDivision.SIXTEENTH
    bpm: float = 120.0
    strength: float = 1.0
    gate_threshold_db: float = -40.0
    transients_only: bool = False
    preserve_formant: bool = True
    swing_amount: float = 0.0
    humanize_amount: float = 0.0
    offset_ms: float = 0.0


class AudioQuantizer:
    """
    Quantize audio transients to a musical grid.
    Uses onset detection + time-warping for high-quality alignment.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.config = QuantizeConfig()
        self._onsets: np.ndarray | None = None
        self._grid_positions: np.ndarray | None = None

    def detect_onsets(self, y: np.ndarray) -> np.ndarray:
        """Detect audio transients/onsets."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        envelope = np.abs(y)
        
        sos = signal.butter(2, 50.0, btype='high', output='sos', fs=self.sr)
        envelope = signal.sosfilt(sos, envelope)
        
        from scipy.ndimage import uniform_filter1d
        envelope = uniform_filter1d(envelope, size=int(self.sr * 0.01))
        
        threshold = 10 ** (self.config.gate_threshold_db / 20.0)
        
        diff = np.diff(envelope)
        
        onsets = []
        for i in range(len(diff) - 1):
            if diff[i] > threshold and envelope[i] > threshold:
                if len(onsets) == 0 or i - onsets[-1] > int(self.sr * 0.01):
                    onsets.append(i)
        
        self._onsets = np.array(onsets, dtype=np.int64)
        
        return self._onsets

    def compute_grid(self, num_beats: int = 16) -> np.ndarray:
        """Compute grid positions in samples."""
        beat_samples = int(self.sr * 60.0 / self.config.bpm)
        
        division_samples = self._get_division_samples(beat_samples)
        
        grid = []
        for beat in range(num_beats):
            for div in range(self._get_divisions_per_beat()):
                pos = beat * beat_samples + div * division_samples
                grid.append(pos)
        
        if self.config.swing_amount > 0:
            grid = self._apply_swing(grid, beat_samples)
        
        if self.config.offset_ms > 0:
            offset_samples = int(self.config.offset_ms * self.sr / 1000.0)
            grid = np.array(grid) + offset_samples
        else:
            grid = np.array(grid)
        
        if self.config.humanize_amount > 0:
            grid = self._apply_humanize(grid)
        
        self._grid_positions = grid
        return grid

    def _get_division_samples(self, beat_samples: int) -> int:
        """Get samples per grid division."""
        division_map = {
            GridDivision.WHOLE: 4,
            GridDivision.HALF: 2,
            GridDivision.QUARTER: 1,
            GridDivision.EIGHTH: 1,
            GridDivision.SIXTEENTH: 1,
            GridDivision.THIRTY_SECOND: 1,
            GridDivision.DOTTED_QUARTER: 3,
            GridDivision.DOTTED_EIGHTH: 3,
            GridDivision.TRIPLET_EIGHTH: 2,
            GridDivision.TRIPLET_SIXTEENTH: 2,
        }
        divisions = division_map.get(self.config.grid, 1)
        
        if self.config.grid == GridDivision.TRIPLET_EIGHTH:
            return int(beat_samples / 3 * 2)
        elif self.config.grid == GridDivision.TRIPLET_SIXTEENTH:
            return int(beat_samples / 6 * 2)
        else:
            return int(beat_samples / divisions)

    def _get_divisions_per_beat(self) -> int:
        """Get number of divisions per beat."""
        div_per_beat = {
            GridDivision.WHOLE: 1,
            GridDivision.HALF: 2,
            GridDivision.QUARTER: 4,
            GridDivision.EIGHTH: 8,
            GridDivision.SIXTEENTH: 16,
            GridDivision.THIRTY_SECOND: 32,
            GridDivision.DOTTED_QUARTER: 6,
            GridDivision.DOTTED_EIGHTH: 12,
            GridDivision.TRIPLET_EIGHTH: 3,
            GridDivision.TRIPLET_SIXTEENTH: 6,
        }
        return div_per_beat.get(self.config.grid, 4)

    def _apply_swing(self, grid: np.ndarray, beat_samples: int) -> np.ndarray:
        """Apply swing timing to grid."""
        if abs(self.config.swing_amount) < 0.001:
            return grid
        
        swung = grid.copy()
        divs = self._get_divisions_per_beat()
        eighth_note = divs // 2
        
        if divs >= 4 and eighth_note > 0:
            for i in range(0, len(grid) - 1, divs):
                if i + 1 < len(swung):
                    off_beat = i + eighth_note
                    if off_beat < len(swung):
                        beat_frac = (self.config.swing_amount * beat_samples / 2)
                        swung[off_beat] += int(beat_frac)
        
        return swung

    def _apply_humanize(self, grid: np.ndarray) -> np.ndarray:
        """Add humanization variation to grid."""
        if self.config.humanize_amount <= 0:
            return grid
        
        np.random.seed(42)
        variation = np.random.randn(len(grid)) * self.config.humanize_amount
        
        ms_to_samples = self.sr / 1000.0
        variation_samples = variation * ms_to_samples * 10
        
        return (grid + variation_samples.astype(int)).clip(0, None)

    def quantize(self, y: np.ndarray) -> np.ndarray:
        """Quantize audio to grid."""
        y = np.asarray(y, dtype=np.float64).ravel()
        
        if self._onsets is None or len(self._onsets) == 0:
            self.detect_onsets(y)
        
        if self._grid_positions is None:
            self.compute_grid(num_beats=int(len(y) / self.sr * self.config.bpm / 60) + 1)
        
        n = len(y)
        
        mapping = np.zeros(n, dtype=np.float64)
        
        for i in range(n):
            if self._onsets is not None and len(self._onsets) > 0:
                closest_onset = self._onsets[np.argmin(np.abs(self._onsets - i))]
                grid_idx = np.argmin(np.abs(self._grid_positions - closest_onset))
                target_pos = self._grid_positions[grid_idx]
                
                distance = target_pos - closest_onset
                
                if abs(distance) < int(self.sr * 0.1):
                    offset = int(distance * self.config.strength)
                    mapping[i] = i + offset
                else:
                    mapping[i] = i
            else:
                mapping[i] = i
        
        mapping = np.clip(mapping, 0, n - 1).astype(np.float64)
        
        return np.interp(mapping, np.arange(n), y).astype(np.float64)

    def quantize_elastic(self, y: np.ndarray) -> np.ndarray:
        """Elastic time-warping quantize."""
        from scipy.interpolate import interp1d
        
        y = np.asarray(y, dtype=np.float64).ravel()
        n = len(y)
        
        if self._onsets is None or len(self._onsets) == 0:
            self.detect_onsets(y)
        
        if self._grid_positions is None:
            self.compute_grid(num_beats=int(n / self.sr * self.config.bpm / 60) + 1)
        
        self._grid_positions = self._grid_positions[self._grid_positions < n]
        
        new_onset_positions = []
        for onset in self._onsets:
            if onset >= n:
                continue
            grid_idx = np.argmin(np.abs(self._grid_positions - onset))
            target = self._grid_positions[grid_idx]
            new_pos = onset + (target - onset) * self.config.strength
            new_onset_positions.append(new_pos)
        
        if len(new_onset_positions) < 2:
            return y
        
        new_onset_positions = np.array(sorted(new_onset_positions))
        
        warp = np.zeros(n)
        warp[0] = 0
        
        onset_idx = 0
        for i in range(1, n):
            while onset_idx < len(new_onset_positions) - 1:
                if i >= self._onsets[onset_idx] and i < self._onsets[onset_idx + 1]:
                    break
                onset_idx += 1
            
            if onset_idx < len(self._onsets) - 1:
                ratio = (i - self._onsets[onset_idx]) / (self._onsets[onset_idx + 1] - self._onsets[onset_idx] + 1e-10)
                warp[i] = new_onset_positions[onset_idx] + ratio * (new_onset_positions[onset_idx + 1] - new_onset_positions[onset_idx])
            else:
                offset = new_onset_positions[onset_idx] - self._onsets[onset_idx]
                warp[i] = i + offset * self.config.strength
        
        warp[0] = 0
        
        xi = np.arange(n)
        warped = np.interp(warp, xi, y)
        
        return warped.astype(np.float64)


def align_to_grid(onset: int, grid: np.ndarray, strength: float = 1.0) -> int:
    """Snap a single onset to nearest grid position."""
    if len(grid) == 0:
        return onset
    
    nearest = grid[np.argmin(np.abs(grid - onset))]
    return int(onset + (nearest - onset) * strength)


def detect_tempo(samples: np.ndarray, sr: int) -> float:
    """Detect tempo from audio using onset patterns."""
    from scipy.signal import find_peaks
    
    envelope = np.abs(samples)
    sos = signal.butter(2, 10.0, btype='high', output='sos', fs=sr)
    envelope = signal.sosfilt(sos, envelope)
    
    peaks, _ = find_peaks(envelope, distance=int(sr * 0.1))
    
    if len(peaks) < 4:
        return 120.0
    
    intervals = np.diff(peaks) / sr
    
    valid_intervals = intervals[(intervals > 0.2) & (intervals < 2.0)]
    
    if len(valid_intervals) == 0:
        return 120.0
    
    median_interval = float(np.median(valid_intervals))
    bpm = 60.0 / median_interval
    
    for _ in range(3):
        if bpm > 200:
            bpm /= 2
        elif bpm < 40:
            bpm *= 2
    
    return round(bpm, 1)


def warp_audio_to_tempo(
    y: np.ndarray,
    sr: int,
    from_bpm: float,
    to_bpm: float,
) -> np.ndarray:
    """Time-stretch audio to match target tempo."""
    rate = from_bpm / to_bpm
    
    from calliope.tune.psola import time_stretch
    return time_stretch(y, sr, rate)