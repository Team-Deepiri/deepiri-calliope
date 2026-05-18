"""Melody generator using Markov chains and scale constraints."""

from __future__ import annotations

import random
import numpy as np
from typing import List, Tuple, Optional


class MelodyGenerator:
    """Generates monophonic melodies based on harmony and scale."""

    def __init__(self, scale: List[int], root_midi: int = 60):
        self.scale = scale
        self.root_midi = root_midi
        self.current_note_idx = 0
        
        # Simple Markov transition matrix for melodic motion (index-based)
        # Higher probability for small intervals (step-wise motion)
        self.transition_probs = self._create_transition_matrix(len(scale) * 2)

    def _create_transition_matrix(self, size: int) -> np.ndarray:
        matrix = np.zeros((size, size))
        for i in range(size):
            for j in range(size):
                diff = abs(i - j)
                if diff == 0:
                    matrix[i, j] = 0.2  # Stay on same note
                elif diff == 1:
                    matrix[i, j] = 0.4  # Step up/down
                elif diff == 2:
                    matrix[i, j] = 0.2  # Skip
                else:
                    matrix[i, j] = 0.2 / (diff**2) # Leap (diminishing probability)
            matrix[i] /= matrix[i].sum()
        return matrix

    def generate(
        self,
        length_steps: int,
        chord_progression: List[List[int]],
        rhythmic_density: float = 0.7,
    ) -> List[Tuple[int, float, float]]:
        """
        Generate a list of (midi_note, start_time, duration) tuples.
        Times are in beats.
        """
        melody = []
        current_time = 0.0
        step_duration = 0.25 # 16th notes
        
        # Expand scale across two octaves
        full_scale = []
        for octave in [-1, 0, 1]:
            for interval in self.scale:
                full_scale.append(self.root_midi + interval + (octave * 12))
        
        current_idx = len(full_scale) // 2 # Start in middle
        
        for step in range(length_steps):
            # Decide whether to play a note
            if random.random() < rhythmic_density:
                # Select next note using transition matrix
                current_idx = np.random.choice(len(full_scale), p=self.transition_probs[current_idx])
                
                # Bias towards chord notes if available
                current_chord = chord_progression[int(current_time / 4) % len(chord_progression)]
                if random.random() < 0.5: # 50% chance to force a chord note
                    closest_chord_note = min(current_chord, key=lambda x: abs(x - full_scale[current_idx]))
                    note = closest_chord_note
                else:
                    note = full_scale[current_idx]
                
                # Duration can be 1, 2, or 4 steps
                duration = random.choice([1, 1, 2, 4]) * step_duration
                melody.append((int(note), current_time, duration))
                
                # Advance time by duration (or slightly less for legato)
                current_time += duration
            else:
                current_time += step_duration
                
            if current_time >= (length_steps * step_duration):
                break
                
        return melody
