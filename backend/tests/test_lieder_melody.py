from pathlib import Path

from calliope.audio.lieder_melody import (
    collect_lieder_dataset,
    duration_log,
    event_beats,
    fifths_to_major_root,
    infer_key,
    log_to_beats,
    nearest_pool_index,
    parse_mscx_lyric_notes,
    parse_mscx_song,
    voice_for_midis,
)

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "lieder_snippet.mscx"


def test_parse_mscx_reads_vocal_lyrics_not_piano():
    notes = parse_mscx_lyric_notes(_FIXTURE)
    toks = [n.tok for n in notes]
    assert toks == ["her", "arms", "a", "cross", "her", "breast", "she", "laid"]
    assert [n.midi for n in notes] == [72, 70, 68, 68, 67, 65, 63, 63]
    assert notes[5].phrase_end is True  # rest after "breast"
    assert notes[7].phrase_end is True  # "laid:" and last note
    assert notes[0].beats == 0.5
    assert notes[7].beats == 1.0
    assert "skip" not in toks


def test_parse_mscx_song_reads_c_major():
    song = parse_mscx_song(_FIXTURE)
    assert song is not None
    assert song.root == "C"
    assert song.scale == "major"


def test_voice_for_midis_picks_soprano_for_high_line():
    assert voice_for_midis([72, 70, 68, 63]) == "soprano"
    assert voice_for_midis([48, 50, 52]) == "bass"


def test_nearest_pool_index_prefers_same_pitch_class():
    pool = [60, 64, 67, 72]  # C E G C
    assert nearest_pool_index(72, pool) == 3
    assert nearest_pool_index(48, pool) == 0  # C3 → C4, not E


def test_fifths_and_duration_helpers():
    assert fifths_to_major_root(0) == "C"
    assert fifths_to_major_root(-4) == "G#"  # Ab
    assert infer_key(-4, [68, 70, 63, 68])[0] in {"G#", "F"}  # Ab major or F minor
    assert duration_log(0.5) == 0.0
    assert abs(log_to_beats(1.0) - 1.0) < 1e-6


def test_event_beats_dotted_quarter():
    import xml.etree.ElementTree as ET

    el = ET.fromstring("<Chord><durationType>quarter</durationType><dots>1</dots></Chord>")
    assert event_beats(el) == 1.5


def test_collect_lieder_dataset_from_fixture():
    x, y, n_songs = collect_lieder_dataset(_FIXTURE.parent)
    assert n_songs >= 1
    assert x.shape[0] == y.shape[0]
    assert x.shape[0] >= 6
    assert x.shape[1] == 12
    assert y.ndim == 2 and y.shape[1] == 2


def test_train_and_save_ingests_lieder_fixture(tmp_path):
    import numpy as np

    from calliope.audio.vocal_melody_ml import train_and_save

    dest = tmp_path / "vocal_melody_mlp.npz"
    train_and_save(dest, n_songs=40, lieder_root=_FIXTURE.parent, mix_teacher=True)
    data = np.load(dest)
    assert int(data["n_lieder_songs"]) >= 1
    assert data["w1"].shape[0] == 12
    assert data["w3"].ndim == 2 and data["w3"].shape[1] == 2
