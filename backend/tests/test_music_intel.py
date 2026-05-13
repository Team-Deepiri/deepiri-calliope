from calliope.music.brief_analysis import analyze_brief_text


def test_bpm_extract():
    b = analyze_brief_text("Make it slam at 174 BPM neuro funk")
    assert b.tempo_bpm == 174
    assert b.tempo_confidence > 0.9


def test_genre_garage():
    b = analyze_brief_text("Dark UK garage 2-step shuffle")
    assert "garage" in b.genres


def test_swing_bias():
    b = analyze_brief_text("swung hats triplet feel lazy pocket")
    assert b.swing_bias > 0.55
