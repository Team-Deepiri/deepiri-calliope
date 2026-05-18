"""Hybrid drum machine engine combining synthesis and samples."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Literal


@dataclass
class DrumSlotConfig:
    name: str
    source_type: Literal["synth", "sample"] = "synth"
    synth_type: Optional[Literal["kick", "snare", "hihat", "perc"]] = "kick"
    sample_path: Optional[str] = None
    volume: float = 0.8
    pan: float = 0.5
    pitch: float = 1.0
    decay: float = 0.5


@dataclass
class DrumPattern:
    name: str
    steps: int = 16
    grid: Dict[int, List[int]] = field(default_factory=dict)  # slot_index: [active_steps]


class DrumMachine:
    """Multi-slot drum engine with synthesis and sequencing."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.slots: List[DrumSlotConfig] = [
            DrumSlotConfig("Kick", "synth", "kick"),
            DrumSlotConfig("Snare", "synth", "snare"),
            DrumSlotConfig("Closed Hat", "synth", "hihat", decay=0.1),
            DrumSlotConfig("Open Hat", "synth", "hihat", decay=0.6),
            DrumSlotConfig("Clap", "synth", "perc"),
        ] + [DrumSlotConfig(f"Slot {i}", "synth", "perc") for i in range(11)]
        
        self.patterns: List[DrumPattern] = [DrumPattern("Default")]

    def _generate_kick(self, duration: float, decay: float, pitch: float) -> np.ndarray:
        n = int(duration * self.sr)
        t = np.arange(n) / self.sr
        # Pitch sweep from high to low
        freq = 150 * pitch * np.exp(-t * (20 / decay)) + 50
        phase = 2 * np.pi * np.cumsum(freq) / self.sr
        samples = np.sin(phase)
        # Amplitude envelope
        env = np.exp(-t * (10 / decay))
        return samples * env

    def _generate_snare(self, duration: float, decay: float) -> np.ndarray:
        n = int(duration * self.sr)
        t = np.arange(n) / self.sr
        # Noise + fundamental tone
        noise = np.random.randn(n)
        tone = np.sin(2 * np.pi * 180 * t)
        env = np.exp(-t * (15 / decay))
        return (noise * 0.7 + tone * 0.3) * env

    def _generate_hihat(self, duration: float, decay: float) -> np.ndarray:
        n = int(duration * self.sr)
        t = np.arange(n) / self.sr
        # High-passed noise
        noise = np.random.randn(n)
        from scipy.signal import butter, lfilter
        b, a = butter(4, 5000 / (self.sr / 2), btype="high")
        hat = lfilter(b, a, noise)
        env = np.exp(-t * (30 / decay))
        return hat * env

    def generate_step(self, slot_index: int) -> np.ndarray:
        slot = self.slots[slot_index]
        duration = 0.5 # Default max duration for a drum hit
        
        if slot.source_type == "synth":
            if slot.synth_type == "kick":
                samples = self._generate_kick(duration, slot.decay, slot.pitch)
            elif slot.synth_type == "snare":
                samples = self._generate_snare(duration, slot.decay)
            elif slot.synth_type == "hihat":
                samples = self._generate_hihat(duration, slot.decay)
            else:
                samples = np.random.randn(int(duration * self.sr)) * 0.1
        else:
            # TODO: Load sample from path
            samples = np.zeros(int(duration * self.sr))
            
        return samples * slot.volume

    def render_pattern(self, pattern_index: int, bpm: int) -> np.ndarray:
        pattern = self.patterns[pattern_index]
        step_duration = 60.0 / bpm / 4.0 # 16th notes
        total_duration = step_duration * pattern.steps
        output = np.zeros(int(total_duration * self.sr))
        
        for slot_idx, active_steps in pattern.grid.items():
            for step in active_steps:
                if step < pattern.steps:
                    samples = self.generate_step(slot_idx)
                    start_sample = int(step * step_duration * self.sr)
                    end_sample = min(start_sample + len(samples), len(output))
                    output[start_sample:end_sample] += samples[:end_sample - start_sample]
                    
        return output
