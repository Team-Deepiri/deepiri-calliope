"""Central conductor engine for orchestrating autonomous song generation."""

from __future__ import annotations

import numpy as np
from typing import Optional

from calliope.audio.routing import AudioGraph
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.drum_machine import DrumMachine, DrumPattern
from calliope.audio.synthesizer import generate_sequence
from calliope.audio.generative_sequencer import Arpeggiator, EuclideanGenerator
from calliope.audio.spatial import ConvolutionReverb
from calliope.audio.dynamics_suite import MultibandCompressor

from calliope.audio.neural_vocal import NeuralVocalEngine, NeuralVocalConfig
from calliope.audio.vocal_synth import AIVocalSynthesizer


class Conductor:
    """Orchestrates the full pipeline from prompt to finished song."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.graph = AudioGraph(sample_rate=sr)
        # Heavy vocal engines are created lazily on first lyric/sing request.
        self._vocal_ai: Optional[AIVocalSynthesizer] = None
        self._neural_vocal: Optional[NeuralVocalEngine] = None

    @staticmethod
    def _pad_or_trim(arr: np.ndarray, length: int) -> np.ndarray:
        if len(arr) < length:
            return np.pad(arr, (0, length - len(arr)))
        return arr[:length]

    def _ensure_vocal_engines(self) -> tuple[AIVocalSynthesizer, NeuralVocalEngine]:
        if self._vocal_ai is None:
            self._vocal_ai = AIVocalSynthesizer(sr=self.sr)
        if self._neural_vocal is None:
            self._neural_vocal = NeuralVocalEngine(sr=self.sr)
        return self._vocal_ai, self._neural_vocal

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
        Short clips (≤4 bars) use a lean path for snappier gesture feedback.
        """
        lean = duration_bars <= 4

        # 1. Setup Intelligence Layers
        harmony = HarmonyEngine(root=key, scale_type=scale_type)
        melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
        drums = DrumMachine(sr=self.sr)
        arp = Arpeggiator(mode="random", octaves=1 if lean else 2, rate=0.25)

        # 2. Generate Musical Content
        prog_len = 2 if lean else 8
        progression = harmony.generate_progression(mood=mood, length=prog_len)

        # Euclidean Drum Patterns
        kick_pattern = EuclideanGenerator(16, 4).generate()
        hat_pattern = EuclideanGenerator(16, 12).generate()
        active_steps = {
            0: [i for i, v in enumerate(kick_pattern) if v],
            2: [i for i, v in enumerate(hat_pattern) if v],
        }
        drums.patterns = [DrumPattern("Euclidean", steps=16, grid=active_steps)]

        # 3. Render Layers
        target_len = int(duration_bars * 4.0 * 60 / bpm * self.sr)
        drum_track = drums.render_pattern(0, bpm)
        n_repeats = max(1, int(np.ceil(target_len / max(1, len(drum_track)))))
        drum_track = np.tile(drum_track, n_repeats)[:target_len]

        # Arpeggiated Lead Layer — only cover the requested duration
        beats_per_chord = max(1.0, (duration_bars * 4.0) / max(1, len(progression)))
        arp_notes = []
        for i, chord in enumerate(progression):
            arp_seq = arp.generate(chord, beats_per_chord)
            for n, s, d in arp_seq:
                arp_notes.append((n, s + (i * beats_per_chord), d))
        melody_track = generate_sequence("lead_synth", arp_notes, sr=self.sr)

        # --- AI Vocal Layer (skip on lean / gesture clips) ---
        vocal_track = np.zeros(target_len)
        if not lean and ("lyrics" in prompt.lower() or "sing" in prompt.lower()):
            vocal_ai, neural_vocal = self._ensure_vocal_engines()
            lyrics = "Floating through the neon sky, AI singing high"
            vocal_melody = [
                (melody_gen.generate(16, progression)[0][0] + 12, i * 2.0, 1.0) for i in range(16)
            ]
            raw_vocal = vocal_ai.synthesize(lyrics, vocal_melody)
            vocal_track = neural_vocal.process(
                raw_vocal,
                prompt_context=prompt,
                config=NeuralVocalConfig(strength=1.0, speed=1.0, doubling_mode="wide"),
            )
            vocal_track = self._pad_or_trim(vocal_track, target_len)

        # 4. Final Mix and Master
        max_len = max(len(drum_track), len(melody_track), len(vocal_track), target_len)
        final_mix = np.zeros(max_len)

        final_mix += self._pad_or_trim(drum_track, max_len) * 0.7
        final_mix += self._pad_or_trim(melody_track, max_len) * 0.5
        final_mix += self._pad_or_trim(vocal_track, max_len) * 0.8
        final_mix = final_mix[:target_len]

        if not lean:
            try:
                reverb = ConvolutionReverb.create_algorithmic_ir(2.0, 1.5, self.sr)
                final_mix = reverb.process(final_mix, wet_dry=0.15)
            except Exception:
                pass
            try:
                mbc = MultibandCompressor(self.sr)
                final_mix = mbc.process(final_mix)
            except Exception:
                pass

        peak = float(np.max(np.abs(final_mix))) if final_mix.size else 0.0
        if peak > 1e-9:
            final_mix = final_mix / peak * 0.85
        return final_mix
