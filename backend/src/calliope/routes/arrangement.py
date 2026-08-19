"""AI arrangement generation and variation API routes."""

from __future__ import annotations

import random

from fastapi import APIRouter, HTTPException, Body

from calliope.audio.arrangement_plan import build_arrangement, instruments_for_genre
from calliope.audio.harmony_engine import HarmonyEngine

router = APIRouter(prefix="/v1/arrangement", tags=["arrangement"])


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
    _ = duration_bars
    return build_arrangement(
        prompt,
        bpm=bpm,
        key=key,
        scale_type=scale_type,
        genre=genre or "electronic",
        mood=mood,
    )


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
        arrangement["instruments"] = instruments_for_genre(new_genre)
        for section in sections:
            section["instruments"] = instruments_for_genre(new_genre)

    arrangement["variation_type"] = variation_type
    arrangement["variation_intensity"] = intensity

    return arrangement
