from __future__ import annotations


def major_scale_midi(root_midi: int) -> list[int]:
    intervals = [0, 2, 4, 5, 7, 9, 11]
    return [root_midi + i for i in intervals]


def minor_scale_midi(root_midi: int, natural: bool = True) -> list[int]:
    if natural:
        intervals = [0, 2, 3, 5, 7, 8, 10]
    else:
        intervals = [0, 2, 3, 5, 7, 8, 11]
    return [root_midi + i for i in intervals]
