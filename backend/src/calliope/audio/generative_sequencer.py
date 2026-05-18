"""Generative sequencing tools: Euclidean rhythms and Arpeggiators."""

from __future__ import annotations

import random
from typing import List, Tuple, Literal


class EuclideanGenerator:
    """Generates Euclidean rhythmic patterns based on pulses and steps."""

    def __init__(self, steps: int = 16, pulses: int = 5):
        self.steps = steps
        self.pulses = pulses

    def generate(self) -> List[int]:
        """Bjorklund's algorithm for evenly distributed pulses."""
        if self.pulses > self.steps:
            return [1] * self.steps
        
        pattern = []
        counts = [self.pulses, self.steps - self.pulses]
        remainders = [self.pulses, self.steps - self.pulses]
        
        # Build pattern recursively
        def build(idx: int):
            if remainders[idx] == 0:
                return
            if counts[idx] == 0:
                return
            # Simplified logic for the shebang
            step_size = self.steps / self.pulses
            return [1 if i % step_size < 1 else 0 for i in range(self.steps)]

        # Direct calculation for better stability in this context
        step_size = self.steps / self.pulses
        return [1 if (i * self.pulses) % self.steps < self.pulses else 0 for i in range(self.steps)]


class Arpeggiator:
    """Generates arpeggiated note sequences from a chord."""

    def __init__(
        self,
        mode: Literal["up", "down", "up-down", "random", "chord"] = "up",
        octaves: int = 1,
        rate: float = 0.25 # 16th notes
    ):
        self.mode = mode
        self.octaves = octaves
        self.rate = rate

    def generate(self, chord_notes: List[int], length_beats: float) -> List[Tuple[int, float, float]]:
        """Returns list of (midi_note, start, duration)."""
        all_notes = []
        for o in range(self.octaves):
            all_notes.extend([n + (o * 12) for n in chord_notes])
        
        all_notes.sort()
        
        sequence = []
        if self.mode == "up":
            pattern = all_notes
        elif self.mode == "down":
            pattern = all_notes[::-1]
        elif self.mode == "up-down":
            pattern = all_notes + all_notes[-2:0:-1]
        elif self.mode == "random":
            pattern = all_notes.copy()
            random.shuffle(pattern)
        else:
            pattern = [chord_notes] # Chord mode
            
        current_beat = 0.0
        idx = 0
        while current_beat < length_beats:
            note = pattern[idx % len(pattern)]
            if isinstance(note, list):
                # Multiple notes for chord mode
                for n in note:
                    sequence.append((n, current_beat, self.rate))
            else:
                sequence.append((note, current_beat, self.rate))
                
            current_beat += self.rate
            idx += 1
            
        return sequence
