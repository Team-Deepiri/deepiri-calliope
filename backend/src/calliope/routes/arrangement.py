"""AI arrangement generation and variation API routes."""

from __future__ import annotations

import random
from typing import Any

from fastapi import APIRouter, HTTPException, Body

from calliope.audio.harmony_engine import HarmonyEngine
from calliope.audio.melody_generator import MelodyGenerator
from calliope.config import get_settings

router = APIRouter(prefix="/v1/arrangement", tags=["arrangement"])


def _instruments_for_genre(genre: str) -> list[str]:
    library = {
        "electronic": ["sub_bass", "synth_pad", "synth_lead", "drums", "fx"],
        "hiphop": ["808_bass", "drums", "sampled_pad", "melodic_lead", "vocal_chops"],
        "rock": ["bass_guitar", "drums", "rhythm_guitar", "lead_guitar", "vocals"],
        "pop": ["sub_bass", "drums", "synth_pad", "acoustic_guitar", "vocals", "backing_vocals"],
        "ambient": ["synth_pad", "drone_bass", "texture", "fx", "field_recording"],
        "jazz": ["acoustic_bass", "drums", "piano", "saxophone", "guitar"],
        "orchestral": ["strings", "brass", "woodwinds", "percussion", "choir"],
    }
    for key, instruments in library.items():
        if key in genre.lower():
            return instruments
    return ["bass", "drums", "synth_pad", "synth_lead"]


def _section_bars(name: str) -> int:
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


def _section_dynamics(name: str) -> str:
    soft = ("intro", "breakdown", "bridge", "verse")
    loud = ("chorus", "drop", "solo", "outro")
    if name.lower() in soft:
        return "soft"
    if name.lower() in loud:
        return "loud"
    return "medium"


@router.post("/generate")
async def generate_arrangement(
    prompt: str = Body(...),
    bpm: int = Body(120),
    key: str = Body("C"),
    scale_type: str = Body("major"),
    genre: str | None = Body(None),
    duration_bars: int = Body(32),
    mood: str = Body("balanced"),
) -> dict:
    """
    Generate full arrangement from text description.
    Returns a structured arrangement plan with sections, instruments,
    chord progressions, and melodic motifs.
    """
    import re

    genre = genre or "electronic"
    harmony = HarmonyEngine(root=key, scale_type=scale_type)
    progression = harmony.generate_progression(mood=mood, length=8)

    melody_gen = MelodyGenerator(scale=harmony.scale, root_midi=harmony.root_midi)
    motif = melody_gen.generate(16, progression, rhythmic_density=0.6)

    section_names = re.findall(
        r"(intro|verse|pre-chorus|chorus|post-chorus|bridge|breakdown|buildup|drop|solo|outro)",
        prompt.lower(),
    )
    if not section_names:
        section_names = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]

    instruments = _instruments_for_genre(genre or prompt)

    sections = []
    bar_cursor = 0
    for name in section_names:
        bars = _section_bars(name)
        active_instruments = instruments.copy()
        if name.lower() in ("intro", "breakdown", "bridge"):
            active_instruments = [i for i in active_instruments if i not in ("drums",)]
        if name.lower() in ("drop", "chorus", "solo"):
            active_instruments = instruments + (["fx"] if "fx" not in instruments else [])

        section = {
            "name": name.capitalize(),
            "start_bar": bar_cursor,
            "bars": bars,
            "instruments": active_instruments,
            "dynamics": _section_dynamics(name),
            "chord_progression": [list(map(int, c)) for c in progression],
            "energy": "high" if name.lower() in ("drop", "chorus", "solo") else "low" if name.lower() in ("intro", "breakdown", "bridge") else "mid",
        }
        sections.append(section)
        bar_cursor += bars

    total_bars = bar_cursor
    return {
        "prompt": prompt,
        "bpm": bpm,
        "key": key,
        "scale": scale_type,
        "genre": genre or "auto-detected",
        "mood": mood,
        "total_bars": total_bars,
        "estimated_duration_sec": (total_bars * 4 * 60) / bpm,
        "sections": sections,
        "chord_progression_summary": [f"Chord {i+1}: {c}" for i, c in enumerate(progression)],
        "melody_motif": [{"midi_note": int(n), "start_beat": round(s, 2), "duration_beats": round(d, 2)} for n, s, d in motif[:12]],
        "instrument_count": len(set(instruments)),
    }


@router.post("/variation")
async def generate_variation(
    arrangement: dict = Body(...),
    variation_type: str = Body("reharmonize"),
    intensity: float = Body(0.5),
) -> dict:
    """
    Generate a variation of an existing arrangement.
    variation_type: reharmonize, restructure, retempo, restyle
    """
    valid_types = ["reharmonize", "restructure", "retempo", "restyle"]
    if variation_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid variation_type. Choose from: {valid_types}")

    bpm = arrangement.get("bpm", 120)
    key = arrangement.get("key", "C")
    scale_type = arrangement.get("scale", arrangement.get("scale_type", "major"))
    sections = arrangement.get("sections", [])
    existing_progression = arrangement.get("chord_progression_summary", [])

    harmony = HarmonyEngine(root=key, scale_type=scale_type)

    if variation_type == "reharmonize":
        mood_cycle = ["happy", "dark", "jazz", "sad"]
        current_mood = arrangement.get("mood", "happy")
        idx = mood_cycle.index(current_mood) if current_mood in mood_cycle else 0
        new_mood = mood_cycle[(idx + 1) % len(mood_cycle)]
        new_progression = harmony.generate_progression(mood=new_mood, length=len(existing_progression) or 8)
        arrangement["mood"] = new_mood
        arrangement["chord_progression_summary"] = [f"Chord {i+1}: {c}" for i, c in enumerate(new_progression)]
        for section in sections:
            section["chord_progression"] = [list(map(int, c)) for c in new_progression]

    elif variation_type == "restructure":
        random.shuffle(sections)
        for i, section in enumerate(sections):
            section["start_bar"] = sum(sections[j].get("bars", 8) for j in range(i))
        arrangement["sections"] = sections

    elif variation_type == "retempo":
        new_bpm = int(bpm * (1.0 + (random.uniform(-0.2, 0.2) * intensity)))
        new_bpm = max(60, min(200, new_bpm))
        arrangement["bpm"] = new_bpm
        total_bars = arrangement.get("total_bars", 32)
        arrangement["estimated_duration_sec"] = (total_bars * 4 * 60) / new_bpm

    elif variation_type == "restyle":
        genres = ["electronic", "hiphop", "ambient", "pop", "orchestral"]
        current_genre = arrangement.get("genre", "electronic")
        filtered = [g for g in genres if g != current_genre]
        new_genre = random.choice(filtered)
        arrangement["genre"] = new_genre
        arrangement["instruments"] = _instruments_for_genre(new_genre)
        for section in sections:
            section["instruments"] = _instruments_for_genre(new_genre)

    arrangement["variation_type"] = variation_type
    arrangement["variation_intensity"] = intensity

    return arrangement
