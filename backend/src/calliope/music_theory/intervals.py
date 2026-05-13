from __future__ import annotations


def interval_name(semitones: int) -> str:
    st = semitones % 12
    names = {
        0: "P1",
        1: "m2",
        2: "M2",
        3: "m3",
        4: "M3",
        5: "P4",
        6: "TT",
        7: "P5",
        8: "m6",
        9: "M6",
        10: "m7",
        11: "M7",
    }
    return names.get(st, f"{semitones}st")


def semitone_delta(midi_a: float, midi_b: float) -> int:
    return int(round(midi_b - midi_a))
