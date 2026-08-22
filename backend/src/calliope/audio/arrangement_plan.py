"""Deterministic arrangement skeleton used by /arrangement/generate and Aamati compose."""

from __future__ import annotations

import re
from typing import Any

from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.melody_generator import MelodyGenerator

# Keep in sync with section_bars() keys — extend both when adding new section labels.
_SECTION_NAMES = (
    "intro",
    "verse",
    "pre-chorus",
    "chorus",
    "post-chorus",
    "bridge",
    "breakdown",
    "buildup",
    "drop",
    "solo",
    "outro",
)
_SECTION_RE = re.compile("|".join(re.escape(name) for name in _SECTION_NAMES))


def instruments_for_genre(genre: str) -> list[str]:
    library = {
        "electronic": ["sub_bass", "synth_pad", "synth_lead", "drums", "fx"],
        "hiphop": ["808_bass", "drums", "sampled_pad", "melodic_lead", "vocal_chops"],
        "rock": ["bass_guitar", "drums", "rhythm_guitar", "lead_guitar", "vocals"],
        "pop": ["sub_bass", "drums", "synth_pad", "acoustic_guitar", "vocals", "backing_vocals"],
        "ambient": ["synth_pad", "drone_bass", "texture", "fx", "field_recording"],
        "jazz": ["acoustic_bass", "drums", "piano", "saxophone", "guitar"],
        "orchestral": ["strings", "brass", "woodwinds", "percussion", "choir"],
        "dnb": ["sub_bass", "drums", "reese", "pads", "fx"],
        "garage": ["sub_bass", "drums", "keys", "vocal_chops", "fx"],
        "techno": ["kick", "hats", "bass", "stabs", "fx"],
    }
    for key, instruments in library.items():
        if key in genre.lower():
            return instruments
    return ["bass", "drums", "synth_pad", "synth_lead"]


def section_bars(name: str) -> int:
    mapping = {
        "intro": 8,
        "verse": 8,
        "pre-chorus": 4,
        "chorus": 8,
        "post-chorus": 4,
        "bridge": 8,
        "breakdown": 4,
        "buildup": 4,
        "drop": 8,
        "solo": 8,
        "outro": 4,
    }
    return mapping.get(name.lower(), 8)


def section_dynamics(name: str) -> str:
    soft = ("intro", "breakdown", "bridge", "verse")
    loud = ("chorus", "drop", "solo", "outro")
    if name.lower() in soft:
        return "soft"
    if name.lower() in loud:
        return "loud"
    return "medium"


def build_arrangement(
    prompt: str,
    *,
    bpm: int = 120,
    key: str = "C",
    scale_type: str = "major",
    genre: str | None = None,
    mood: str = "balanced",
    drum_density: float = 0.6,
) -> dict[str, Any]:
    genre = genre or "electronic"
    harmony = HarmonyEngine(root=key, scale_type=scale_type)
    harmony_mood = mood if mood in HarmonyEngine.PROGRESSIONS else "happy"
    progression = harmony.generate_progression(mood=harmony_mood, length=8)

    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    motif = melody_gen.generate(16, progression, rhythmic_density=drum_density)

    section_names = _SECTION_RE.findall(prompt.lower())
    if not section_names:
        section_names = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]

    instruments = instruments_for_genre(genre or prompt)

    sections: list[dict[str, Any]] = []
    bar_cursor = 0
    for name in section_names:
        bars = section_bars(name)
        active_instruments = instruments.copy()
        if name.lower() in ("intro", "breakdown", "bridge") and drum_density < 0.45:
            active_instruments = [i for i in active_instruments if i not in ("drums", "kick", "hats")]
        if name.lower() in ("drop", "chorus", "solo"):
            active_instruments = instruments + (["fx"] if "fx" not in instruments else [])

        sections.append(
            {
                "name": name.capitalize(),
                "start_bar": bar_cursor,
                "bars": bars,
                "instruments": active_instruments,
                "dynamics": section_dynamics(name),
                "chord_progression": [list(map(int, c)) for c in progression],
                "energy": (
                    "high"
                    if name.lower() in ("drop", "chorus", "solo")
                    else "low"
                    if name.lower() in ("intro", "breakdown", "bridge")
                    else "mid"
                ),
                "drum_density": round(drum_density, 3),
            }
        )
        bar_cursor += bars

    total_bars = bar_cursor
    safe_bpm = max(40, min(220, int(bpm)))
    return {
        "prompt": prompt,
        "bpm": safe_bpm,
        "key": key,
        "scale": scale_type,
        "genre": genre or "auto-detected",
        "mood": harmony_mood,
        "total_bars": total_bars,
        "estimated_duration_sec": (total_bars * 4 * 60) / safe_bpm,
        "sections": sections,
        "chord_progression_summary": [f"Chord {i+1}: {c}" for i, c in enumerate(progression)],
        "melody_motif": [
            {"midi_note": int(n), "start_beat": round(s, 2), "duration_beats": round(d, 2)}
            for n, s, d in motif[:12]
        ],
        "instrument_count": len(set(instruments)),
        "drum_density": round(drum_density, 3),
    }
