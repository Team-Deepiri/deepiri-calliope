from __future__ import annotations

from dataclasses import dataclass

from calliope.music.brief_analysis import BriefAnalysis


@dataclass
class SectionPlan:
    name: str
    bars: int
    role: str


@dataclass
class ProductionStructure:
    """4/4 bar counts per section; scales with tempo and energy."""

    bpm_assumed: int
    sections: list[SectionPlan]
    total_bars: int


def plan_structure(analysis: BriefAnalysis, default_bpm: int = 120) -> ProductionStructure:
    bpm = analysis.tempo_bpm or default_bpm
    e = analysis.energy
    c = analysis.complexity

    drop_mult = 1.0 + 0.35 * e
    build_mult = 0.9 + 0.25 * c
    intro = max(8, int(16 * (1.1 - e * 0.25)))
    build = max(16, int(24 * build_mult))
    drop = max(16, int(32 * drop_mult))
    bridge = max(8, int(16 * (0.8 + analysis.swing_bias * 0.2)))
    outro = max(8, int(16 * (0.9 - e * 0.15)))

    sections = [
        SectionPlan("intro", intro, "establish tonality, filtered drums, tension"),
        SectionPlan("build", build, "add perc layers, risers, harmonic motion"),
        SectionPlan("drop", drop, "full spectrum, hook motif, bass weight"),
        SectionPlan("bridge", bridge, "contrast: breakdown, timbre shift, or half-time"),
        SectionPlan("outro", outro, "resolve, tail, avoid abrupt cut unless intentional"),
    ]
    total = sum(s.bars for s in sections)
    return ProductionStructure(bpm_assumed=bpm, sections=sections, total_bars=total)


def structure_to_prompt_block(struct: ProductionStructure) -> str:
    lines = [
        f"Target tempo context: ~{struct.bpm_assumed} BPM (4/4).",
        f"Suggested total length ~{struct.total_bars} bars across sections:",
    ]
    for s in struct.sections:
        lines.append(f"  - {s.name.upper()} (~{s.bars} bars): {s.role}")
    return "\n".join(lines)
