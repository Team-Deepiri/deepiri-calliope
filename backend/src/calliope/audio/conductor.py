"""Central conductor engine for orchestrating autonomous song generation."""

from __future__ import annotations

import numpy as np
from typing import Dict, List, Any, Optional

from calliope.audio.routing import AudioGraph, SourceNode, EffectNode
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.drum_machine import DrumMachine, DrumPattern
from calliope.audio.synthesizer import Synthesizer, generate_sequence
from calliope.audio.ai_mix import auto_mix
from calliope.audio.instrument_library import library


class Conductor:
    """Orchestrates the full pipeline from prompt to finished song."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.graph = AudioGraph(sample_rate=sr)

    def conduct_song(
        self,
        prompt: str,
        bpm: int = 128,
        key: str = "C",
        scale_type: str = "minor",
        mood: str = "dark",
        duration_bars: int = 32,
    ) -> np.ndarray:
        """
        Conduct a full song generation process.
        Returns the final mastered audio samples.
        """
        # 1. Setup Intelligence Layers
        harmony = HarmonyEngine(root=key, scale_type=scale_type)
        melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
        drums = DrumMachine(sr=self.sr)
        
        # 2. Generate Musical Content
        # Chord Progression (8 bars loop)
        progression = harmony.generate_progression(mood=mood, length=8)
        
        # Melody (using the progression)
        melody_notes = melody_gen.generate(length_steps=duration_bars * 16, chord_progression=progression)
        
        # Drum Pattern (Basic 4-on-the-floor for now)
        drum_pattern = DrumPattern("Main", steps=16, grid={
            0: [0, 4, 8, 12],  # Kick
            1: [4, 12],        # Snare
            2: [0, 2, 4, 6, 8, 10, 12, 14], # Closed Hat
        })
        drums.patterns = [drum_pattern]
        
        # 3. Render Layers
        # --- Drum Layer ---
        drum_samples = drums.render_pattern(0, bpm)
        # Repeat to fill duration
        n_repeats = int(np.ceil(duration_bars * 4.0 / (len(drum_samples) / self.sr * bpm / 60.0)))
        drum_track = np.tile(drum_samples, n_repeats)[:int(duration_bars * 4.0 * 60 / bpm * self.sr)]
        
        # --- Bass Layer ---
        bass_preset = library.get_preset("Morphing Bass")
        bass_notes = []
        for i, chord in enumerate(progression):
            # Play root of the chord for 1 bar
            bass_notes.append((chord[0] - 12, i * 4.0, 4.0))
        
        # Repeat bass loop to fill duration
        full_bass_notes = []
        for i in range(int(np.ceil(duration_bars / 8.0))):
            for n, s, d in bass_notes:
                full_bass_notes.append((n, s + (i * 32.0), d))
        
        bass_track = generate_sequence("bass_sub", full_bass_notes, sr=self.sr)
        
        # --- Melody Layer ---
        melody_track = generate_sequence("lead_synth", melody_notes, sr=self.sr)
        
        # 4. Final Mix and Master
        # Align lengths
        max_len = max(len(drum_track), len(bass_track), len(melody_track))
        final_mix = np.zeros(max_len)
        
        def pad_or_trim(arr, length):
            if len(arr) < length:
                return np.pad(arr, (0, length - len(arr)))
            return arr[:length]
            
        final_mix += pad_or_trim(drum_track, max_len) * 0.8
        final_mix += pad_or_trim(bass_track, max_len) * 0.7
        final_mix += pad_or_trim(melody_track, max_len) * 0.6
        
        # Apply AI Auto-mix and Master
        mastered = auto_mix(final_mix, sr=self.sr, target_lufs=-14.0, brightness=0.6, punch=0.5)
        
        return mastered
