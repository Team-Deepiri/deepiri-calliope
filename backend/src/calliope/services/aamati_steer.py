"""Map Aamati moods (or a raw brief) onto concrete production parameters.

The ontology ranks moods; this module turns the winner into BPM, harmony, drum
density, and mix knobs so Studio/arrangement can follow the prior — not just
stuff it into an LLM prompt.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from calliope.music.brief_analysis import BriefAnalysis
from calliope.services.aamati_prior import AamatiAlignmentResult, MoodAlignment

HarmonyMood = Literal["happy", "sad", "dark", "jazz"]
ScaleType = Literal["major", "minor", "dorian", "phrygian", "lydian", "mixolydian"]

MIN_RANKED_MOOD_SCORE = 0.05
ONNX_SCORE_VS_TOP_RATIO = 0.85  # ONNX mood must reach this fraction of the table winner.
EXPLICIT_BPM_CONFIDENCE = 0.6
STATED_BPM_BLEND = 0.75  # When constrained, keep this much of an explicit brief BPM.
MOOD_BPM_BLEND = 0.25
MIN_BPM = 60
MAX_BPM = 190
DEFAULT_MOOD = "focused"


@dataclass(frozen=True)
class MixSteer:
    brightness: float
    warmth: float
    punch: float
    stereo_width: float
    target_lufs: float


@dataclass(frozen=True)
class ProductionSteer:
    mood: str
    mood_score: float
    source: Literal["aamati", "brief"]
    bpm: int
    key: str
    scale_type: ScaleType
    harmony_mood: HarmonyMood
    drum_density: float
    swing: float
    fill_activity: float
    mix: MixSteer
    rationale: str

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["mix"] = asdict(self.mix)
        return payload


@dataclass(frozen=True)
class _MoodRecipe:
    bpm: int
    scale_type: ScaleType
    harmony_mood: HarmonyMood
    drum_density: float
    swing: float
    fill_activity: float
    mix: MixSteer
    rationale: str


# Targets when Aamati is the constraint. Brief tempo still wins if the user wrote BPM.
_RECIPES: dict[str, _MoodRecipe] = {
    "chill": _MoodRecipe(
        bpm=88,
        scale_type="dorian",
        harmony_mood="sad",
        drum_density=0.32,
        swing=0.58,
        fill_activity=0.22,
        mix=MixSteer(0.32, 0.72, 0.28, 0.90, -16.0),
        rationale="Laid-back pocket: slower grid, sparse drums, warm and wide.",
    ),
    "energetic": _MoodRecipe(
        bpm=128,
        scale_type="major",
        harmony_mood="happy",
        drum_density=0.78,
        swing=0.28,
        fill_activity=0.62,
        mix=MixSteer(0.68, 0.32, 0.74, 0.72, -11.0),
        rationale="Forward drive: brighter top, punchy transients, denser groove.",
    ),
    "suspenseful": _MoodRecipe(
        bpm=96,
        scale_type="phrygian",
        harmony_mood="dark",
        drum_density=0.48,
        swing=0.36,
        fill_activity=0.34,
        mix=MixSteer(0.28, 0.48, 0.55, 0.62, -14.0),
        rationale="Tension: darker mode, held energy, drier width.",
    ),
    "uplifting": _MoodRecipe(
        bpm=118,
        scale_type="lydian",
        harmony_mood="happy",
        drum_density=0.62,
        swing=0.34,
        fill_activity=0.52,
        mix=MixSteer(0.74, 0.42, 0.58, 0.82, -12.0),
        rationale="Open lift: raised fourth color, bright top, mid pulse.",
    ),
    "ominous": _MoodRecipe(
        bpm=84,
        scale_type="minor",
        harmony_mood="dark",
        drum_density=0.40,
        swing=0.30,
        fill_activity=0.28,
        mix=MixSteer(0.22, 0.62, 0.48, 0.55, -15.0),
        rationale="Weight and shade: slower, darker, less stereo splash.",
    ),
    "romantic": _MoodRecipe(
        bpm=92,
        scale_type="dorian",
        harmony_mood="jazz",
        drum_density=0.38,
        swing=0.62,
        fill_activity=0.30,
        mix=MixSteer(0.48, 0.70, 0.32, 0.88, -15.0),
        rationale="Soft swing, jazz voicings, warm body.",
    ),
    "gritty": _MoodRecipe(
        bpm=110,
        scale_type="mixolydian",
        harmony_mood="dark",
        drum_density=0.70,
        swing=0.38,
        fill_activity=0.48,
        mix=MixSteer(0.42, 0.38, 0.80, 0.58, -11.5),
        rationale="Edge and snap: denser drums, punch over polish.",
    ),
    "dreamy": _MoodRecipe(
        bpm=78,
        scale_type="lydian",
        harmony_mood="sad",
        drum_density=0.28,
        swing=0.55,
        fill_activity=0.18,
        mix=MixSteer(0.55, 0.66, 0.22, 1.05, -17.0),
        rationale="Wash and space: slow, sparse, extra width.",
    ),
    "frantic": _MoodRecipe(
        bpm=172,
        scale_type="phrygian",
        harmony_mood="dark",
        drum_density=0.88,
        swing=0.22,
        fill_activity=0.82,
        mix=MixSteer(0.62, 0.24, 0.86, 0.64, -10.5),
        rationale="High-rate grid, busy fills, sharp transients.",
    ),
    "focused": _MoodRecipe(
        bpm=120,
        scale_type="dorian",
        harmony_mood="jazz",
        drum_density=0.55,
        swing=0.40,
        fill_activity=0.40,
        mix=MixSteer(0.50, 0.45, 0.52, 0.70, -13.0),
        rationale="Neutral center: usable default when the brief is mixed.",
    ),
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def heuristic_mood(brief: BriefAnalysis) -> str:
    """Fallback mood when Aamati ontology / scores are unavailable."""
    if brief.energy > 0.7 and brief.valence < 0.42:
        return "frantic" if (brief.tempo_bpm or 0) >= 150 else "gritty"
    if brief.energy > 0.65:
        return "energetic"
    if brief.valence > 0.58:
        return "uplifting" if brief.energy > 0.5 else "romantic"
    if brief.valence < 0.42:
        return "ominous" if brief.energy < 0.5 else "suspenseful"
    if brief.swing_bias > 0.58:
        return "dreamy"
    if brief.energy < 0.4:
        return "chill"
    return DEFAULT_MOOD


def pick_mood(alignment: AamatiAlignmentResult | None, brief: BriefAnalysis) -> tuple[str, float, str]:
    """Winner mood, score, and 'aamati' vs 'brief' source."""
    ranked = alignment.ranked_moods if alignment else []
    if ranked and ranked[0].score > MIN_RANKED_MOOD_SCORE:
        top = ranked[0]
        if alignment and alignment.onnx_mood:
            onnx = next((m for m in ranked if m.mood == alignment.onnx_mood), None)
            if onnx and onnx.score >= top.score * ONNX_SCORE_VS_TOP_RATIO:
                return onnx.mood, onnx.score, "aamati"
        return top.mood, top.score, "aamati"
    return heuristic_mood(brief), 0.0, "brief"


def _blend_bpm(brief: BriefAnalysis, recipe_bpm: int, constrain: bool) -> int:
    stated = brief.tempo_bpm
    if stated and brief.tempo_confidence >= EXPLICIT_BPM_CONFIDENCE:
        if not constrain:
            return int(stated)
        blended = STATED_BPM_BLEND * stated + MOOD_BPM_BLEND * recipe_bpm
        return int(_clamp(blended, MIN_BPM, MAX_BPM))
    return recipe_bpm if constrain else int(stated or recipe_bpm)


def _brief_only_steer(brief: BriefAnalysis) -> ProductionSteer:
    mood = heuristic_mood(brief)
    recipe = _RECIPES[mood]
    density = _clamp(0.22 + brief.energy * 0.7 + brief.complexity * 0.15, 0.15, 0.95)
    swing = _clamp(brief.swing_bias, 0.15, 0.85)
    return ProductionSteer(
        mood=mood,
        mood_score=0.0,
        source="brief",
        bpm=_blend_bpm(brief, recipe.bpm, constrain=False),
        key="C",
        scale_type="minor" if brief.valence < 0.45 else "major",
        harmony_mood="dark" if brief.valence < 0.45 else "happy",
        drum_density=density,
        swing=swing,
        fill_activity=_clamp(brief.complexity * 0.7, 0.15, 0.9),
        mix=MixSteer(
            brightness=_clamp(0.35 + brief.valence * 0.4, 0.2, 0.85),
            warmth=_clamp(0.55 - brief.energy * 0.25, 0.2, 0.8),
            punch=_clamp(0.3 + brief.energy * 0.5, 0.2, 0.9),
            stereo_width=_clamp(0.6 + brief.valence * 0.25, 0.5, 1.0),
            target_lufs=-14.0 + (1.0 - brief.energy) * -3.0,
        ),
        rationale="Brief-only: energy/valence/swing set density and mix; Aamati ignored.",
    )


def steer_from_alignment(
    brief: BriefAnalysis,
    alignment: AamatiAlignmentResult | None,
    *,
    constrain: bool = True,
) -> ProductionSteer:
    """Concrete production knobs from a brief, optionally locked to Aamati's top mood."""
    if not constrain:
        return _brief_only_steer(brief)

    mood, score, source = pick_mood(alignment, brief)
    recipe = _RECIPES.get(mood, _RECIPES[DEFAULT_MOOD])
    return ProductionSteer(
        mood=mood,
        mood_score=round(score, 4),
        source=source,
        bpm=_blend_bpm(brief, recipe.bpm, constrain=True),
        key="C",
        scale_type=recipe.scale_type,
        harmony_mood=recipe.harmony_mood,
        drum_density=recipe.drum_density,
        swing=recipe.swing,
        fill_activity=recipe.fill_activity,
        mix=recipe.mix,
        rationale=recipe.rationale,
    )


def format_steer_block(steer: ProductionSteer) -> str:
    mix = steer.mix
    return (
        "[Aamati production steer — hard parameters]\n"
        f"- Mood: {steer.mood} (score {steer.mood_score:.2f}, source={steer.source})\n"
        f"- Tempo: {steer.bpm} BPM · swing {steer.swing:.2f}\n"
        f"- Harmony: {steer.key} {steer.scale_type}, progression mood={steer.harmony_mood}\n"
        f"- Drums: density {steer.drum_density:.2f}, fills {steer.fill_activity:.2f}\n"
        f"- Mix: brightness {mix.brightness:.2f}, warmth {mix.warmth:.2f}, "
        f"punch {mix.punch:.2f}, width {mix.stereo_width:.2f}, target {mix.target_lufs:.1f} LUFS\n"
        f"- Why: {steer.rationale}\n"
        "Treat these as numeric targets for tempo, groove, harmony, and mix — not optional flavor text.\n"
    )


def ranked_mood_dicts(moods: list[MoodAlignment], k: int = 3) -> list[dict[str, Any]]:
    return [
        {
            "mood": m.mood,
            "score": round(m.score, 4),
            "emoji": m.emoji,
            "table_summary": m.table_summary,
        }
        for m in moods[:k]
    ]
