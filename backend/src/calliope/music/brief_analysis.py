from __future__ import annotations

import re
from dataclasses import dataclass, field

_BPM_RE = re.compile(r"\b(\d{2,3})\s*(?:bpm|BPM)\b")
_SWING_HINTS = frozenset(
    "swing swung shuffle triplet lazy drag laid-back pocket groove humanize".split()
)
_STRAIGHT_HINTS = frozenset("straight grid quantized machine rigid four-on-the-floor".split())
_DARK_MOODS = frozenset("dark noir tense ominous industrial dystopian cold".split())
_BRIGHT_MOODS = frozenset("bright airy euphoric uplifting sunny open lush".split())
_GENRE_LEXICON: dict[str, tuple[str, ...]] = {
    "garage": ("garage", "ukg", "uk garage", "2-step", "2step"),
    "house": ("house", "deep house", "progressive house", "acid"),
    "techno": ("techno", "minimal", "industrial techno", "berlin"),
    "dnb": ("dnb", "drum and bass", "jungle", "neuro"),
    "hiphop": ("hip hop", "hip-hop", "trap", "boom bap", "rap"),
    "ambient": ("ambient", "drone", "soundscape", "pads"),
    "jazz": ("jazz", "swing", "bebop", "fusion"),
    "pop": ("pop", "topline", "hook"),
    "metal": ("metal", "djent", "double kick"),
    "folk": ("folk", "acoustic", "fingerstyle"),
}


@dataclass
class BriefAnalysis:
    """Structured extraction from a natural-language producer brief (no LLM)."""

    raw_text: str
    tempo_bpm: int | None = None
    tempo_confidence: float = 0.0
    genres: list[str] = field(default_factory=list)
    swing_bias: float = 0.0
    energy: float = 0.5
    valence: float = 0.0
    complexity: float = 0.5
    keywords: list[str] = field(default_factory=list)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def analyze_brief_text(text: str) -> BriefAnalysis:
    t = text.strip()
    low = t.lower()
    analysis = BriefAnalysis(raw_text=t)

    m = _BPM_RE.search(t)
    if m:
        analysis.tempo_bpm = int(m.group(1))
        analysis.tempo_confidence = 0.95

    genres: list[str] = []
    for label, needles in _GENRE_LEXICON.items():
        if any(n in low for n in needles):
            genres.append(label)
    analysis.genres = list(dict.fromkeys(genres)) if genres else ["electronic"]

    swing_hits = sum(1 for w in _SWING_HINTS if w in low)
    straight_hits = sum(1 for w in _STRAIGHT_HINTS if w in low)
    analysis.swing_bias = _clamp(0.5 + 0.12 * swing_hits - 0.15 * straight_hits)

    dark = sum(1 for w in _DARK_MOODS if w in low)
    bright = sum(1 for w in _BRIGHT_MOODS if w in low)
    analysis.valence = _clamp(0.5 + 0.1 * (bright - dark))
    analysis.energy = _clamp(0.45 + 0.08 * low.count("!") + 0.05 * ("heavy" in low or "aggressive" in low))

    if "minimal" in low or "sparse" in low:
        analysis.complexity = 0.35
    elif "dense" in low or "layered" in low or "orchestral" in low:
        analysis.complexity = 0.85
    else:
        analysis.complexity = 0.55

    analysis.keywords = [w for w in low.split() if len(w) > 4][:12]
    return analysis
