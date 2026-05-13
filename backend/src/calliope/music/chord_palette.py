"""Genre-conditional scale / mode hints for prompt enrichment (heuristic, not generative)."""

from __future__ import annotations

_PALETTES: dict[str, str] = {
    "garage": "Favor minor keys, II-V borrowings, 7th and 9th extensions on pads; keep bass sub-focused under ~90 Hz fundamental.",
    "house": "Four-on-the-floor clarity; try Dorian or natural minor for darker deep house; keep kick transient short for sidechain headroom.",
    "techno": "Hypnotic loops; Phrygian or Locrian touches for industrial variants; hi-hat velocity humanization ±8%.",
    "dnb": "Fast sub movement; consider minor pentatonic riffs; watch 2–4 kHz snare crack vs vocal intelligibility.",
    "hiphop": "Sparse triads + extensions; pocket ahead/behind grid intentionally; 808 glide legato vs kick overlap.",
    "ambient": "Cluster voicings, wide fifths, slow LFO on filter; avoid sharp transients unless textural.",
    "jazz": "ii-V-I voice leading; guide tones on 3rd/7th; walking bass quarter-note grid vs swung comp.",
    "pop": "Strong hook register ~C4–G4; diatonic extensions; pre-chorus lift via harmonic rhythm half-time or add9 shimmer.",
    "metal": "Lower triads/power chords; double-kick vs bass guitar pick attack separation.",
    "folk": "Open voicings, capo-friendly shapes; transient-light percussion; preserve headroom for vocal.",
    "electronic": "Balance subtractive vs additive layers; stereo bass only above ~90 Hz; mono sub.",
}


def palette_lines(genres: list[str]) -> str:
    lines: list[str] = []
    for g in genres:
        key = g.lower().strip()
        if key in _PALETTES:
            lines.append(f"- {key}: {_PALETTES[key]}")
    if not lines:
        lines.append(f"- electronic: {_PALETTES['electronic']}")
    return "\n".join(lines)
