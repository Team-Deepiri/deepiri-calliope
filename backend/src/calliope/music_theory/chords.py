from __future__ import annotations


def major_triad_pc(root_pc: int) -> tuple[int, int, int]:
    r = root_pc % 12
    return (r, (r + 4) % 12, (r + 7) % 12)


def minor_triad_pc(root_pc: int) -> tuple[int, int, int]:
    r = root_pc % 12
    return (r, (r + 3) % 12, (r + 7) % 12)
