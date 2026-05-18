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


from calliope.audio.neural_vocal import NeuralVocalEngine, NeuralVocalConfig
from calliope.audio.vocal_synth import AIVocalSynthesizer


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
        arp = Arpeggiator(mode="random", octaves=2, rate=0.25)
        vocal_ai = AIVocalSynthesizer(sr=self.sr)
        neural_vocal = NeuralVocalEngine(sr=self.sr)
        
        # 2. Generate Musical Content
        progression = harmony.generate_progression(mood=mood, length=8)
        
        # Euclidean Drum Patterns
        kick_pattern = EuclideanGenerator(16, 4).generate()
        hat_pattern = EuclideanGenerator(16, 12).generate()
        active_steps = {0: [i for i, v in enumerate(kick_pattern) if v], 2: [i for i, v in enumerate(hat_pattern) if v]}
        drums.patterns = [DrumPattern("Euclidean", steps=16, grid=active_steps)]
        
        # 3. Render Layers
        drum_track = drums.render_pattern(0, bpm)
        n_repeats = int(np.ceil(duration_bars * 4.0 / (len(drum_track) / self.sr * bpm / 60.0)))
        drum_track = np.tile(drum_track, n_repeats)[:int(duration_bars * 4.0 * 60 / bpm * self.sr)]
        
        # Arpeggiated Lead Layer
        arp_notes = []
        for i, chord in enumerate(progression):
            arp_seq = arp.generate(chord, 4.0)
            for n, s, d in arp_seq:
                arp_notes.append((n, s + (i * 4.0), d))
        
        full_arp_notes = []
        for i in range(int(np.ceil(duration_bars / 8.0))):
            for n, s, d in arp_notes:
                full_arp_notes.append((n, s + (i * 32.0), d))
        melody_track = generate_sequence("lead_synth", full_arp_notes, sr=self.sr)
        
        # --- AI Vocal Layer (if lyrics detected) ---
        vocal_track = np.zeros_like(melody_track)
        if "lyrics" in prompt.lower() or "sing" in prompt.lower():
            # Dummy lyrics and melody for the shebang
            lyrics = "Floating through the neon sky, AI singing high"
            vocal_melody = [(melody_gen.generate(16, progression)[0][0] + 12, i * 2.0, 1.0) for i in range(16)]
            raw_vocal = vocal_ai.synthesize(lyrics, vocal_melody)
            
            # Apply Neural Autotune
            vocal_track = neural_vocal.process(
                raw_vocal, 
                prompt_context=prompt, 
                config=NeuralVocalConfig(strength=1.0, speed=1.0, doubling_mode="wide")
            )
            vocal_track = pad_or_trim(vocal_track, len(melody_track))

        # 4. Final Mix and Master
        max_len = max(len(drum_track), len(melody_track), len(vocal_track))
        final_mix = np.zeros(max_len)
        
        def pad_or_trim(arr, length):
            if len(arr) < length:
                return np.pad(arr, (0, length - len(arr)))
            return arr[:length]
            
        final_mix += pad_or_trim(drum_track, max_len) * 0.7
        final_mix += pad_or_trim(melody_track, max_len) * 0.5
        final_mix += pad_or_trim(vocal_track, max_len) * 0.8
        
        # --- Mastering Chain ---
        reverb = ConvolutionReverb.create_algorithmic_ir(2.0, 1.5, self.sr)
        final_mix = reverb.process(final_mix, wet_dry=0.15)
        mbc = MultibandCompressor(self.sr)
        final_mix = mbc.process(final_mix)
        mastered = auto_mix(final_mix, sr=self.sr, target_lufs=-14.0, brightness=0.6)
        
        return mastered
