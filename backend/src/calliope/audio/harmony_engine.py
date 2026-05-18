"""Harmony engine for generating music-theory-based chord progressions."""

from __future__ import annotations

import random
from typing import List, Tuple, Literal


class HarmonyEngine:
    """Engine for generating chord progressions based on key and mood."""

    SCALES = {
        "major": [0, 2, 4, 5, 7, 9, 11],
        "minor": [0, 2, 3, 5, 7, 8, 10],
        "dorian": [0, 2, 3, 5, 7, 9, 10],
        "phrygian": [0, 1, 3, 5, 7, 8, 10],
        "lydian": [0, 2, 4, 6, 7, 9, 11],
        "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    }

    CHORD_TYPES = {
        "major": [0, 4, 7],
        "minor": [0, 3, 7],
        "dim": [0, 3, 6],
        "maj7": [0, 4, 7, 11],
        "min7": [0, 3, 7, 10],
        "dom7": [0, 4, 7, 10],
    }

    PROGRESSIONS = {
        "happy": [[1, 4, 5, 1], [1, 5, 6, 4], [1, 6, 4, 5]],
        "sad": [[1, 6, 3, 7], [1, 4, 1, 5], [6, 4, 1, 5]],
        "dark": [[1, 2, 1, 2], [1, 6, 2, 5], [1, 3, 4, 6]],
        "jazz": [[2, 5, 1, 6], [1, 4, 7, 3, 6, 2, 5, 1]],
    }

    def __init__(self, root: str = "C", scale_type: str = "major"):
        self.root = root
        self.scale_type = scale_type
        self.root_midi = self._note_to_midi(root)
        self.scale = self.SCALES.get(scale_type, self.SCALES["major"])

    def _note_to_midi(self, note: str) -> int:
        notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        return notes.index(note.upper()) + 60

    def get_chord_notes(self, degree: int, octave: int = 4) -> List[int]:
        """Get MIDI notes for a chord degree within the current scale."""
        root_idx = (degree - 1) % len(self.scale)
        root_pitch = self.root_midi + self.scale[root_idx] + (octave - 5) * 12
        
        # Determine if the chord should be major or minor based on scale degrees
        # (Simplified diatonic triad logic)
        third_idx = (root_idx + 2) % len(self.scale)
        fifth_idx = (root_idx + 4) % len(self.scale)
        
        third_interval = (self.scale[third_idx] - self.scale[root_idx]) % 12
        fifth_interval = (self.scale[fifth_idx] - self.scale[root_idx]) % 12
        
        return [root_pitch, root_pitch + third_interval, root_pitch + fifth_interval]

    def generate_progression(self, mood: str, length: int = 4) -> List[List[int]]:
        """Generate a sequence of MIDI chord note lists."""
        prog_degrees = random.choice(self.PROGRESSIONS.get(mood, self.PROGRESSIONS["happy"]))
        
        # Scale/repeat to match requested length
        while len(prog_degrees) < length:
            prog_degrees.extend(prog_degrees)
        prog_degrees = prog_degrees[:length]
        
        return [self.get_chord_notes(d) for d in prog_degrees]
