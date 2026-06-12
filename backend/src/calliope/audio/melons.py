"""MELONS: two-stage music structure generation.

Stage 1: structure planning (repetition, development, cadence sections).
Stage 2: note generation conditioned on structure patterns.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal


SectionType = Literal["intro", "verse", "chorus", "bridge", "outro", "fill"]


@dataclass
class MelonsConfig:
    num_sections: int = 8
    max_phrases_per_section: int = 4
    notes_per_phrase: int = 8
    pitch_range: int = 72
    pitch_offset: int = 36
    latent_dim: int = 256
    hidden_dim: int = 512
    temperature: float = 1.0
    pattern_types: tuple[Literal["repetition", "development", "cadence"], ...] = (
        "repetition", "development", "cadence",
    )


@dataclass
class PhrasePattern:
    pattern_type: Literal["repetition", "development", "cadence"]
    notes: np.ndarray
    confidence: float = 1.0


class StructureGenerator:
    """Generates section-level structure plan with phrase patterns."""

    def __init__(self, config: MelonsConfig):
        self.config = config
        rng = np.random.default_rng(42)
        s = 0.02
        self.w_section = rng.normal(0, s, (config.hidden_dim, config.latent_dim)).astype(np.float32)
        self.b_section = np.zeros(config.hidden_dim, dtype=np.float32)
        self.w_pattern = rng.normal(0, s, (len(config.pattern_types), config.hidden_dim)).astype(np.float32)
        self.b_pattern = np.zeros(len(config.pattern_types), dtype=np.float32)
        self.w_transition = rng.normal(0, s, (config.hidden_dim, config.hidden_dim)).astype(np.float32)
        self.b_transition = np.zeros(config.hidden_dim, dtype=np.float32)

        self.section_types: list[SectionType] = [
            "intro", "verse", "verse", "chorus",
            "bridge", "chorus", "chorus", "outro",
        ]

    def forward(self, z: np.ndarray) -> tuple[list[SectionType], list[list[PhrasePattern]]]:
        batch = z.shape[0]
        h = np.tanh(z @ self.w_section.T + self.b_section)

        sections: list[SectionType] = []
        phrases_per_section: list[list[PhrasePattern]] = []

        for sec_idx in range(self.config.num_sections):
            section_type = self.section_types[sec_idx % len(self.section_types)]
            sections.append(section_type)

            num_phrases = min(np.random.randint(2, self.config.max_phrases_per_section + 1),
                              self.config.max_phrases_per_section)
            h = np.tanh(h @ self.w_transition.T + self.b_transition)

            pattern_logits = h @ self.w_pattern.T + self.b_pattern
            pattern_probs = np.exp(pattern_logits - np.max(pattern_logits, axis=-1, keepdims=True))
            pattern_probs /= np.sum(pattern_probs, axis=-1, keepdims=True)

            phrase_patterns: list[PhrasePattern] = []
            phrase_cache: np.ndarray | None = None

            for p_idx in range(num_phrases):
                pattern_idx = int(np.random.choice(len(self.config.pattern_types),
                                                    p=pattern_probs[0]))
                pattern_type = self.config.pattern_types[pattern_idx]

                if pattern_type == "repetition" and phrase_cache is not None:
                    notes = phrase_cache.copy()
                elif pattern_type == "development" and phrase_cache is not None:
                    notes = phrase_cache + 0.1 * np.random.randn(*phrase_cache.shape).astype(np.float32)
                    notes = np.clip(notes, 0, 1)
                else:
                    notes = np.random.rand(self.config.notes_per_phrase).astype(np.float32)

                phrase_patterns.append(PhrasePattern(pattern_type=pattern_type, notes=notes))
                phrase_cache = notes

            phrases_per_section.append(phrase_patterns)

        return sections, phrases_per_section


class NoteGenerator:
    """Generates note-level sequences conditioned on phrase patterns."""

    def __init__(self, config: MelonsConfig):
        self.config = config
        rng = np.random.default_rng(42)
        s = 0.02
        self.w_phrase = rng.normal(0, s, (config.hidden_dim, config.notes_per_phrase)).astype(np.float32)
        self.b_phrase = np.zeros(config.hidden_dim, dtype=np.float32)
        self.w_pitch = rng.normal(0, s, (config.pitch_range, config.hidden_dim)).astype(np.float32)
        self.b_pitch = np.zeros(config.pitch_range, dtype=np.float32)
        self.w_dur = rng.normal(0, s, (16, config.hidden_dim)).astype(np.float32)
        self.b_dur = np.zeros(16, dtype=np.float32)
        self.w_boundary = rng.normal(0, s, (2, config.hidden_dim)).astype(np.float32)
        self.b_boundary = np.zeros(2, dtype=np.float32)

    def _parse_boundaries(self, notes: np.ndarray) -> np.ndarray:
        boundaries = np.zeros(len(notes), dtype=np.float32)
        if len(notes) > 4:
            idxs = np.linspace(0, len(notes) - 1, 4, dtype=int)
            boundaries[idxs] = 1.0
        return boundaries

    def generate_notes(
        self, sections: list[SectionType],
        phrase_plans: list[list[PhrasePattern]],
    ) -> list[list[tuple[int, float, float, float]]]:
        """Generate note sequences per section. Returns
        list of (pitch, start_time, duration, velocity) per section.
        """
        all_sections: list[list[tuple[int, float, float, float]]] = []
        global_time = 0.0

        for sec_idx, (section_type, patterns) in enumerate(zip(sections, phrase_plans)):
            section_notes: list[tuple[int, float, float, float]] = []
            for pattern in patterns:
                phrase_notes = self._generate_phrase(pattern, global_time)
                section_notes.extend(phrase_notes)
                global_time = phrase_notes[-1][1] + phrase_notes[-1][2] if phrase_notes else global_time + 1.0

            all_sections.append(section_notes)

        return all_sections

    def _generate_phrase(
        self, pattern: PhrasePattern, start_time: float,
    ) -> list[tuple[int, float, float, float]]:
        phrase_feat = self._parse_boundaries(pattern.notes)
        h = np.tanh(pattern.notes @ self.w_phrase.T + self.b_phrase)

        pitch_logits = h @ self.w_pitch.T + self.b_pitch
        dur_logits = h @ self.w_dur.T + self.b_dur
        boundary_logits = phrase_feat @ self.w_boundary.T + self.b_boundary

        pitch_probs = np.exp(pitch_logits - np.max(pitch_logits, axis=-1, keepdims=True))
        pitch_probs /= np.sum(pitch_probs, axis=-1, keepdims=True)

        dur_probs = np.exp(dur_logits - np.max(dur_logits, axis=-1, keepdims=True))
        dur_probs /= np.sum(dur_probs, axis=-1, keepdims=True)

        notes: list[tuple[int, float, float, float]] = []
        current_time = start_time

        for step in range(self.config.notes_per_phrase):
            pitch = int(np.random.choice(self.config.pitch_range, p=pitch_probs[step])) + self.config.pitch_offset
            dur_idx = int(np.random.choice(16, p=dur_probs[step]))
            duration = (dur_idx + 1) * 0.125
            velocity = 60 + int(phrase_feat[step] * 40) if phrase_feat[step] > 0 else 80

            notes.append((pitch, current_time, duration, float(velocity)))
            current_time += duration

        return notes


class MelonsGenerator:
    """Two-stage music structure generator: plan structure, then generate notes."""

    def __init__(self, config: MelonsConfig | None = None):
        self.config = config or MelonsConfig()
        self.structure_gen = StructureGenerator(self.config)
        self.note_gen = NoteGenerator(self.config)

    def generate_structure(
        self, z: np.ndarray | None = None,
    ) -> tuple[list[SectionType], list[list[PhrasePattern]]]:
        """Stage 1: generate section structure and phrase patterns from latent code."""
        if z is None:
            z = np.random.randn(1, self.config.latent_dim).astype(np.float32)
        return self.structure_gen.forward(z)

    def generate_notes(
        self, sections: list[SectionType],
        phrase_plans: list[list[PhrasePattern]],
    ) -> list[list[tuple[int, float, float, float]]]:
        """Stage 2: generate note sequences conditioned on structure."""
        return self.note_gen.generate_notes(sections, phrase_plans)

    def generate(
        self, z: np.ndarray | None = None,
    ) -> tuple[
        list[SectionType],
        list[list[PhrasePattern]],
        list[list[tuple[int, float, float, float]]],
    ]:
        """Full two-stage generation: structure + notes."""
        sections, phrase_plans = self.generate_structure(z)
        notes = self.generate_notes(sections, phrase_plans)
        return sections, phrase_plans, notes

    def generate_melody(
        self, bpm: float = 120.0,
    ) -> tuple[list[tuple[int, float, float, float]], list[str]]:
        """Generate melody with section labels. Returns (notes, section_labels)."""
        sections, phrase_plans, notes_by_section = self.generate()
        all_notes: list[tuple[int, float, float, float]] = []
        labels: list[str] = []
        for sec_type, section_notes in zip(sections, notes_by_section):
            all_notes.extend(section_notes)
            labels.extend([sec_type] * len(section_notes))
        return all_notes, labels
