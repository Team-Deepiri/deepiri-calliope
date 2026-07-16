"""Enhanced conductor that routes prompts through dedicated AI models."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from calliope.audio.conductor import Conductor
from calliope.audio.music_transformer import MusicTransformerModel, TransformerConfig
from calliope.audio.music_vae import MusicVAE
from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.melody_generator import MelodyGenerator
from calliope.audio.drum_machine import DrumMachine, DrumPattern
from calliope.audio.synthesizer import Synthesizer, generate_sequence
from calliope.audio.stem_separation import StemSeparator
from calliope.audio.loop_slicer import LoopSlicer
from calliope.audio.ai_mix import auto_mix, auto_master
from calliope.audio.instrument_library import library
from calliope.audio.neural_vocal import NeuralVocalEngine, NeuralVocalConfig
from calliope.audio.vocal_synth import AIVocalSynthesizer
from calliope.audio.restoration import AudioRestorer
from calliope.audio.loudness import measure_lufs


@dataclass
class ModelRoute:
    model_name: str
    confidence: float
    params: dict[str, Any] = field(default_factory=dict)


_MODEL_KEYWORDS: dict[str, list[str]] = {
    "transformer": ["melody", "lead", "sequence", "generative", "midi", "notes", "jazz", "classical"],
    "muse_gan": ["beat", "drums", "rhythm", "percussion", "groove", "trap", "hiphop"],
    "harmony": ["chord", "progression", "harmony", "ambient", "pad", "atmospheric"],
    "vocal_synth": ["vocal", "sing", "lyrics", "voice", "choir", "rap"],
    "stems": ["separate", "stems", "split", "isolate", "extract", "unmix"],
    "mastering": ["master", "loudness", "finalize", "polish", "mixdown"],
    "restoration": ["restore", "repair", "denoise", "clean", "remove_click"],
}


class EnhancedConductor(Conductor):
    """Extends Conductor with AI model routing for prompt-based generation.

    Analyzes prompt text to select the optimal model, runs generation,
    and passes results through the full mix/master pipeline.
    """

    def __init__(self, sr: int = 48000):
        super().__init__(sr)
        self._models: dict[str, Any] = {}
        self._model_routes: dict[str, ModelRoute] = {}

    def _lazy_load_model(self, name: str) -> Any:
        if name in self._models:
            return self._models[name]

        if name == "transformer":
            cfg = TransformerConfig()
            self._models[name] = MusicTransformerModel(cfg)
        elif name == "muse_gan":
            self._models[name] = MusicVAE()
        elif name == "harmony":
            self._models[name] = HarmonyEngine()
        elif name == "vocal_synth":
            self._models[name] = AIVocalSynthesizer(sr=self.sr)
        elif name == "neural_vocal":
            self._models[name] = NeuralVocalEngine(sr=self.sr)
        elif name == "stems":
            self._models[name] = StemSeparator()
        elif name == "restoration":
            self._models[name] = AudioRestorer(sr=self.sr)

        return self._models.get(name)

    def analyze_prompt(self, prompt: str) -> ModelRoute:
        """Analyze prompt text and select the best model route."""
        scores: dict[str, float] = {}
        prompt_lower = prompt.lower()

        for model_name, keywords in _MODEL_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in prompt_lower)
            if score > 0:
                scores[model_name] = score

        if not scores:
            return ModelRoute("transformer", 0.5, {"mood": "neutral"})

        best_model = max(scores, key=scores.get)
        total = sum(scores.values())
        confidence = scores[best_model] / total if total > 0 else 0.5

        params: dict[str, Any] = {"mood": "neutral"}
        for mood_word in ["dark", "bright", "happy", "sad", "aggressive", "calm", "ambient"]:
            if mood_word in prompt_lower:
                params["mood"] = mood_word
                break

        bpm_match = re.search(r"(\d+)\s*bpm", prompt_lower)
        if bpm_match:
            params["bpm"] = int(bpm_match.group(1))

        key_match = re.search(r"\b([A-G][#b]?)\s+(major|minor|key)\b", prompt_lower)
        if key_match:
            params["key"] = key_match.group(1).upper()

        return ModelRoute(best_model, confidence, params)

    def generate_track_for_prompt(self, prompt: str, duration_sec: float = 30.0) -> np.ndarray:
        """Full pipeline: prompt analysis → model selection → generation → mixing → mastering."""
        route = self.analyze_prompt(prompt)
        bpm = route.params.get("bpm", 128)
        key = route.params.get("key", "C")
        mood = route.params.get("mood", "neutral")
        duration_bars = max(8, int(duration_sec * bpm / 60 / 4))

        raw_audio = self._route_generation(route, prompt, bpm, key, mood, duration_bars)

        processed = auto_mix(raw_audio, sr=self.sr, target_lufs=-14.0, brightness=0.5)
        mastered = auto_master(processed, sr=self.sr, style="balanced")

        return mastered

    def _route_generation(
        self,
        route: ModelRoute,
        prompt: str,
        bpm: int,
        key: str,
        mood: str,
        duration_bars: int,
    ) -> np.ndarray:
        model_name = route.model_name

        if model_name == "transformer":
            model = self._lazy_load_model("transformer")
            seed = model.preprocess_midi([])
            tokens = model.generate(max_length=256, temperature=1.0)
            from calliope.audio.midi_representations import decode_token_sequence
            notes = decode_token_sequence(tokens)
            synth = Synthesizer(sr=self.sr)
            audio = generate_sequence("lead_synth", notes, sr=self.sr)
            return audio

        elif model_name == "muse_gan":
            model = self._lazy_load_model("muse_gan")
            drum_audio = model.generate_drums(bpm=bpm, duration_bars=duration_bars)
            return drum_audio

        elif model_name == "harmony":
            model = self._lazy_load_model("harmony")
            progression = model.generate_progression(mood=mood, length=8)
            audio = self._render_chord_progression(progression, bpm, duration_bars)
            return audio

        elif model_name == "vocal_synth":
            model = self._lazy_load_model("vocal_synth")
            lyrics = "La la la, floating through the dream"
            melody_notes = [(60 + i * 2, i * 2.0, 1.0) for i in range(16)]
            audio = model.synthesize(lyrics, melody_notes)
            nv = self._lazy_load_model("neural_vocal")
            if nv is not None:
                config = NeuralVocalConfig(strength=0.8, speed=1.0, doubling_mode="wide")
                audio = nv.process(audio, prompt_context=prompt, config=config)
            return audio

        elif model_name == "stems":
            return self._conduct_fallback(prompt, bpm, key, mood, duration_bars)

        else:
            return self._conduct_fallback(prompt, bpm, key, mood, duration_bars)

    def _render_chord_progression(
        self, progression: list, bpm: int, duration_bars: int
    ) -> np.ndarray:
        bars = int(np.ceil(duration_bars / len(progression))) * len(progression)
        total_samples = int(bars * 4 * 60 / bpm * self.sr)
        audio = np.zeros(total_samples, dtype=np.float64)
        beats_per_chord = 4
        samples_per_beat = int(60 / bpm * self.sr)

        for ci, chord in enumerate(progression):
            start = ci * beats_per_chord * samples_per_beat
            dur = beats_per_chord * samples_per_beat
            if start + dur > total_samples:
                dur = total_samples - start
            if dur <= 0:
                break
            tone = 440 * (2 ** ((chord[0] - 69) / 12))
            t = np.arange(dur) / self.sr
            partial = np.sin(2 * np.pi * tone * t) * 0.15
            partial += np.sin(2 * np.pi * tone * 2 * t) * 0.05
            env = np.linspace(1, 0.3, dur)
            partial *= env
            audio[start:start + dur] += partial

        return audio

    def _conduct_fallback(
        self,
        prompt: str,
        bpm: int,
        key: str,
        mood: str,
        duration_bars: int,
    ) -> np.ndarray:
        """Fall back to the base Conductor's full song generation."""
        return self.conduct_song(
            prompt=prompt,
            bpm=bpm,
            key=key,
            scale_type="minor" if mood in ("dark", "sad", "aggressive") else "major",
            mood=mood,
            duration_bars=duration_bars,
        )

    def list_available_models(self) -> list[str]:
        """Return names of models that have been loaded or can be loaded."""
        return list(_MODEL_KEYWORDS.keys())
