from pathlib import Path

from calliope.audio.lieder_melody import (
    collect_lieder_dataset,
    nearest_pool_index,
    parse_mscx_lyric_notes,
    voice_for_midis,
)

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "lieder_snippet.mscx"


def test_parse_mscx_reads_vocal_lyrics_not_piano():
    notes = parse_mscx_lyric_notes(_FIXTURE)
    toks = [t for t, _m, _e in notes]
    assert toks == ["her", "arms", "a", "cross", "her", "breast", "she", "laid"]
    assert [m for _t, m, _e in notes] == [72, 70, 68, 68, 67, 65, 63, 63]
    assert notes[7][2] is True  # "laid:" and last note
    assert "skip" not in toks


def test_voice_for_midis_picks_soprano_for_high_line():
    assert voice_for_midis([72, 70, 68, 63]) == "soprano"
    assert voice_for_midis([48, 50, 52]) == "bass"


def test_nearest_pool_index_prefers_same_pitch_class():
    pool = [60, 64, 67, 72]  # C E G C
    assert nearest_pool_index(72, pool) == 3
    assert nearest_pool_index(48, pool) == 0  # C3 → C4, not E


def test_collect_lieder_dataset_from_fixture():
    x, y, n_songs = collect_lieder_dataset(_FIXTURE.parent)
    assert n_songs >= 1
    assert x.shape[0] == y.shape[0]
    assert x.shape[0] >= 6
    assert x.shape[1] == 12


def test_train_and_save_ingests_lieder_fixture(tmp_path):
    import numpy as np

    from calliope.audio.vocal_melody_ml import train_and_save

    dest = tmp_path / "vocal_melody_mlp.npz"
    train_and_save(dest, n_songs=40, lieder_root=_FIXTURE.parent, mix_teacher=True)
    data = np.load(dest)
    assert int(data["n_lieder_songs"]) >= 1
    assert data["w1"].shape[0] == 12

