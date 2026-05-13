from calliope.music_theory import interval_name, major_triad_pc, rotate_mode


def test_major_triad():
    assert major_triad_pc(0) == (0, 4, 7)


def test_interval_name():
    assert interval_name(4) == "M3"


def test_rotate_mode():
    m = [0, 2, 4, 5, 7, 9, 11]
    r = rotate_mode(m, 2)
    assert 2 in r and len(r) == len(m)
