from calliope.schemas import VocalRackIn
from calliope.services.prompt_builder import build_user_payload, format_vocal_rack_block


def test_format_vocal_rack_block_contains_knobs():
    v = VocalRackIn(role="vocoder_synth", breath_air=10, formant_shift=88)
    s = format_vocal_rack_block(v)
    assert "vocoder_synth" in s
    assert "breath/air 10" in s
    assert "warmth/low" in s


def test_build_user_payload_inserts_vocal_section_heading():
    user = build_user_payload(
        "minimal techno kick and hats",
        depth="standard",
        genre_override=None,
        bpm_override=None,
        vocal_rack=VocalRackIn(role="instrumental_focus"),
    )
    assert "## Vocals & processing" in user
    assert "[Vocal chain — Calliope Studio rack]" in user


def test_build_user_payload_without_vocal_omits_heading():
    user = build_user_payload(
        "minimal techno kick and hats",
        depth="standard",
        genre_override=None,
        bpm_override=None,
        vocal_rack=None,
    )
    assert "## Vocals & processing" not in user
