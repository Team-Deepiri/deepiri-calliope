from calliope.music.brief_analysis import BriefAnalysis
from calliope.services.aamati_prior import AamatiAlignmentResult, MoodAlignment
from calliope.services.aamati_steer import (
    _RECIPES,
    format_steer_block,
    heuristic_mood,
    steer_from_alignment,
)


def _alignment(*moods: tuple[str, float]) -> AamatiAlignmentResult:
    brief = BriefAnalysis(raw_text="x", tempo_bpm=None, tempo_confidence=0.0, energy=0.5, valence=0.5)
    ranked = [MoodAlignment(mood=m, score=s) for m, s in moods]
    return AamatiAlignmentResult(brief=brief, ranked_moods=ranked)


def test_frantic_steer_is_fast_and_dense():
    brief = BriefAnalysis(raw_text="neurofunk", energy=0.6, valence=0.4)
    steer = steer_from_alignment(brief, _alignment(("frantic", 2.0), ("chill", 0.1)), constrain=True)
    assert steer.mood == "frantic"
    assert steer.source == "aamati"
    assert steer.bpm == _RECIPES["frantic"].bpm
    assert steer.drum_density > 0.8
    assert steer.scale_type == "phrygian"
    assert steer.mix.punch > 0.7


def test_chill_and_frantic_differ_for_ab():
    brief = BriefAnalysis(raw_text="pads", energy=0.45, valence=0.5)
    a = steer_from_alignment(brief, _alignment(("chill", 3.0)), constrain=True)
    b = steer_from_alignment(brief, _alignment(("frantic", 3.0)), constrain=True)
    assert a.bpm < b.bpm
    assert a.drum_density < b.drum_density
    assert a.mix.target_lufs < b.mix.target_lufs


def test_explicit_bpm_is_kept_when_not_constrained():
    brief = BriefAnalysis(raw_text="174 bpm neuro", tempo_bpm=174, tempo_confidence=0.95, energy=0.5, valence=0.4)
    steer = steer_from_alignment(brief, _alignment(("chill", 4.0)), constrain=False)
    assert steer.source == "brief"
    assert steer.bpm == 174
    assert "Brief-only" in steer.rationale


def test_constrained_explicit_bpm_blends_toward_mood():
    brief = BriefAnalysis(raw_text="174 bpm dark", tempo_bpm=174, tempo_confidence=0.95, energy=0.5, valence=0.3)
    steer = steer_from_alignment(brief, _alignment(("chill", 4.0)), constrain=True)
    assert steer.mood == "chill"
    assert 88 <= steer.bpm < 174


def test_heuristic_mood_dark_brief():
    brief = BriefAnalysis(raw_text="dark", energy=0.45, valence=0.3, swing_bias=0.4)
    assert heuristic_mood(brief) in ("ominous", "suspenseful", "gritty")


def test_steer_block_includes_numeric_targets():
    brief = BriefAnalysis(raw_text="house", energy=0.6, valence=0.6)
    steer = steer_from_alignment(brief, _alignment(("energetic", 1.5)), constrain=True)
    block = format_steer_block(steer)
    assert "hard parameters" in block
    assert str(steer.bpm) in block
    assert "LUFS" in block


def test_unknown_aamati_mood_falls_back_to_focused_recipe():
    brief = BriefAnalysis(raw_text="x", energy=0.5, valence=0.5)
    steer = steer_from_alignment(brief, _alignment(("not-a-mood", 9.0)), constrain=True)
    assert steer.mood == "not-a-mood"
    assert steer.bpm == _RECIPES["focused"].bpm
    assert steer.harmony_mood == _RECIPES["focused"].harmony_mood


def test_sparse_drums_drop_from_intro():
    from calliope.audio.arrangement_plan import build_arrangement

    dense = build_arrangement("intro chorus", bpm=120, mood="happy", drum_density=0.8)
    sparse = build_arrangement("intro chorus", bpm=120, mood="sad", drum_density=0.3)
    intro_dense = next(s for s in dense["sections"] if s["name"] == "Intro")
    intro_sparse = next(s for s in sparse["sections"] if s["name"] == "Intro")
    chorus_sparse = next(s for s in sparse["sections"] if s["name"] == "Chorus")
    assert "drums" in intro_dense["instruments"]
    assert "drums" not in intro_sparse["instruments"]
    assert "drums" in chorus_sparse["instruments"]
