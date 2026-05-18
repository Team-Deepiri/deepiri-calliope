"""Wavetable synthesis engine for complex, evolving timbres."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class WavetableConfig:
    name: str
    tables: List[np.ndarray]  # List of wavetables for morphing
    sample_rate: int = 48000


class WavetableOscillator:
    """Oscillator that morphs between multiple wavetables."""

    def __init__(self, config: WavetableConfig):
        self.config = config
        self.sr = config.sample_rate
        self.phase = 0.0
        self.table_index = 0.0  # 0.0 to len(tables)-1

    def set_table_index(self, index: float) -> None:
        self.table_index = max(0.0, min(index, len(self.config.tables) - 1))

    def generate(self, duration_sec: float, frequency: float) -> np.ndarray:
        n_samples = int(duration_sec * self.sr)
        output = np.zeros(n_samples)
        
        # Determine the two tables to interpolate between
        idx1 = int(self.table_index)
        idx2 = min(idx1 + 1, len(self.config.tables) - 1)
        mix = self.table_index - idx1
        
        table1 = self.config.tables[idx1]
        table2 = self.config.tables[idx2]
        
        table_len = len(table1)
        
        # Generate phase increments
        phase_inc = frequency * table_len / self.sr
        
        for i in range(n_samples):
            # Linear interpolation within the table
            p_idx1 = int(self.phase)
            p_idx2 = (p_idx1 + 1) % table_len
            p_mix = self.phase - p_idx1
            
            # Interpolate in table 1
            v1 = table1[p_idx1] + p_mix * (table1[p_idx2] - table1[p_idx1])
            # Interpolate in table 2
            v2 = table2[p_idx1] + p_mix * (table2[p_idx2] - table2[p_idx1])
            
            # Morph between tables
            output[i] = v1 + mix * (v2 - v1)
            
            # Advance phase
            self.phase = (self.phase + phase_inc) % table_len
            
        return output


def create_basic_wavetables() -> WavetableConfig:
    """Create a set of basic morphable wavetables (Sine -> Square -> Saw)."""
    size = 2048
    t = np.linspace(0, 2 * np.pi, size, endpoint=False)
    
    sine = np.sin(t)
    square = np.sign(np.sin(t))
    saw = 2 * (np.arange(size) / size) - 1
    
    return WavetableConfig(
        name="Basic Morph",
        tables=[sine, square, saw]
    )
