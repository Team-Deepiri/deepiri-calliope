from calliope.routes.ai_generation import _drum_grid_for_genre, _normalize_beat_genre


def test_normalize_beat_genre_aliases():
    assert _normalize_beat_genre("boom-bap") == "boom_bap"
    assert _normalize_beat_genre("UK Garage") == "garage"


def test_drum_grids_differ_by_genre():
    trap = _drum_grid_for_genre("trap")
    house = _drum_grid_for_genre("house")
    assert trap != house
    assert 0 in trap and 1 in trap
    assert len(trap[2]) >= len(house.get(2, []))
