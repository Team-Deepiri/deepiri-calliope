"""Build layered prompts for the model router from brief + deterministic analysis."""

from __future__ import annotations

from typing import Literal

from calliope.music import BriefAnalysis, ProductionStructure, analyze_brief_text, plan_structure
from calliope.music.chord_palette import palette_lines
from calliope.music.structure_engine import structure_to_prompt_block
from calliope.services.aamati_prior import AamatiPrior
from calliope.services.prompts import (
    MUSIC_ARCHITECT_SYSTEM,
    MUSIC_SYSTEM_PROMPT,
    RHYTHM_HARMONY_ADDENDUM,
)

Depth = Literal["standard", "deep"]


def analyze_and_structure(text: str) -> tuple[BriefAnalysis, ProductionStructure]:
    brief = analyze_brief_text(text)
    struct = plan_structure(brief)
    return brief, struct


def build_system_prompt(depth: Depth) -> str:
    if depth == "deep":
        return MUSIC_ARCHITECT_SYSTEM
    return MUSIC_SYSTEM_PROMPT


def build_user_payload(
    user_prompt: str,
    *,
    depth: Depth,
    genre_override: str | None,
    bpm_override: int | None,
) -> str:
    brief = analyze_brief_text(user_prompt)
    if genre_override:
        brief.genres = [g.strip() for g in genre_override.split(",") if g.strip()]
    if bpm_override and bpm_override > 0:
        brief.tempo_bpm = bpm_override
        brief.tempo_confidence = 1.0

    struct = plan_structure(brief)
    palette_block = "[Harmony palette hints]\n" + palette_lines(brief.genres)
    aamati_block = AamatiPrior().build_llm_injection(brief)
    analysis_block = (
        f"[Calliope analysis — deterministic]\n"
        f"- Inferred genres: {', '.join(brief.genres)}\n"
        f"- Tempo: {brief.tempo_bpm or 'unspecified'} BPM (confidence {brief.tempo_confidence:.2f})\n"
        f"- Swing bias (0 straight … 1 swung): {brief.swing_bias:.2f}\n"
        f"- Energy / valence / complexity (0–1): {brief.energy:.2f} / {brief.valence:.2f} / {brief.complexity:.2f}\n"
    )
    structure_block = "[Arrangement scaffold]\n" + structure_to_prompt_block(struct)

    tail = (
        "\nProduce your answer with these sections (markdown headings):\n"
        "## Tempo & meter\n## Harmony & tonality\n## Groove & rhythm\n## Texture & sound design\n"
        "## Arrangement (map to scaffold)\n## Mix notes\n## Next steps in the DAW\n"
    )

    if depth == "deep":
        tail += (
            "\nAdditionally output a machine-readable block at the END:\n"
            "```calliope-json\n"
            '{ "bpm_guess": number|null, "key_guess": string|null, "sections": ['
            '{"name":"string","bars":number,"notes":"string"}], "risks": ["string"] }\n'
            "```\n"
        )

    return (
        f"{analysis_block}\n{aamati_block}\n{palette_block}\n{structure_block}\n\n[Producer brief]\n{user_prompt.strip()}\n"
        f"{RHYTHM_HARMONY_ADDENDUM}{tail}"
    )
