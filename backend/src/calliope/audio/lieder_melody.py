"""OpenScore Lieder (CC0): MuseScore lyrics-on-notes → melody training rows."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

from calliope.audio.vocal_synth import (
    GENRE_PALETTE,
    VOICE_RANGES,
    _NOTE_TO_MIDI,
    _SCALES,
    _scale_pitches,
)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _first_staff_with_lyrics(root: ET.Element) -> ET.Element | None:
    for staff in root.iter():
        if _local(staff.tag) != "Staff":
            continue
        if any(_local(el.tag) == "Lyrics" for el in staff.iter()):
            return staff
    return None


def parse_mscx_lyric_notes(path: Path) -> list[tuple[str, int, bool]]:
    """Return (syllable, midi, phrase_end) from the first staff that carries lyrics."""
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return []
    staff = _first_staff_with_lyrics(tree.getroot())
    if staff is None:
        return []
    rows: list[tuple[str, int, bool]] = []
    for chord in staff.iter():
        if _local(chord.tag) != "Chord":
            continue
        if any(_local(c.tag) in {"grace", "appoggiatura", "acciaccatura"} for c in chord):
            continue
        lyric_el = None
        pitches: list[int] = []
        for child in list(chord):
            name = _local(child.tag)
            if name == "Lyrics":
                no = child.find("no")
                if no is not None and (no.text or "0").strip() not in {"0", ""}:
                    continue
                lyric_el = child
            elif name == "Note":
                p = child.find("pitch")
                if p is not None and p.text and p.text.strip().lstrip("-").isdigit():
                    pitches.append(int(p.text.strip()))
        if lyric_el is None or not pitches:
            continue
        text_el = lyric_el.find("text")
        raw = "".join(text_el.itertext()) if text_el is not None else ""
        tok = "".join(ch for ch in raw.lower() if ch.isalnum() or ch in "'’‘")
        if not tok:
            continue
        phrase_end = any(ch in raw for ch in ".!?;:")
        rows.append((tok, max(pitches), phrase_end))
    if rows:
        tok, midi, _end = rows[-1]
        rows[-1] = (tok, midi, True)
    return rows


def voice_for_midis(midis: list[int]) -> str:
    if not midis:
        return "soprano"
    med = float(np.median(midis))
    if med >= 67:
        return "soprano"
    if med >= 60:
        return "alto"
    if med >= 52:
        return "tenor"
    return "bass"


def nearest_pool_index(midi: int, pool: list[int]) -> int:
    if not pool:
        return 0
    pc = midi % 12
    same = [p for p in pool if p % 12 == pc]
    if same:
        chosen = min(same, key=lambda p: abs(p - midi))
        return pool.index(chosen)
    return int(np.argmin([abs(p - midi) for p in pool]))


def lieder_feature_rows(
    notes: list[tuple[str, int, bool]],
    *,
    genre_preset: str = "acoustic",
    arrangement_style: str = "through-composed",
    voice_name: str | None = None,
) -> tuple[list[np.ndarray], list[float]]:
    """Build (X, y) scale-index examples from one song's lyric notes."""
    from calliope.audio.vocal_melody_ml import syllable_features

    if len(notes) < 6:
        return [], []
    notes = notes[:80]
    voice = voice_name or voice_for_midis([m for _t, m, _e in notes])
    lo, hi = VOICE_RANGES.get(voice, VOICE_RANGES["soprano"])
    pal = GENRE_PALETTE.get(genre_preset, GENRE_PALETTE["acoustic"])
    root = _NOTE_TO_MIDI.get(str(pal["root"]), 67)
    intervals = _SCALES.get(str(pal["scale"]), _SCALES["major"])
    pool = _scale_pitches(root, intervals, lo, hi)
    phrase_idx = 0
    n_phrases = 1 + sum(1 for _t, _m, end in notes[:-1] if end)
    n = len(notes)
    xs: list[np.ndarray] = []
    ys: list[float] = []
    prev = float(len(pool) // 2)
    prev2 = prev
    for i, (tok, midi, phrase_end) in enumerate(notes):
        feat = syllable_features(
            tok=tok,
            i=i,
            n=n,
            phrase_idx=phrase_idx,
            n_phrases=max(1, n_phrases),
            phrase_end=phrase_end,
            phrase_start=i == 0 or (i > 0 and notes[i - 1][2]),
            genre_preset=genre_preset,
            arrangement_style=arrangement_style,
            prev_idx=prev,
            prev2_idx=prev2,
            pool_len=len(pool),
            lo=lo,
            hi=hi,
        )
        idx = nearest_pool_index(midi, pool)
        xs.append(feat)
        ys.append(float(idx))
        prev2 = prev
        prev = float(idx)
        if phrase_end:
            phrase_idx += 1
    return xs, ys


def iter_mscx(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.mscx") if p.is_file())


def collect_lieder_dataset(root: Path) -> tuple[np.ndarray, np.ndarray, int]:
    """Load all parseable scores. Returns X, y, n_songs."""
    xs: list[np.ndarray] = []
    ys: list[float] = []
    n_songs = 0
    for path in iter_mscx(root):
        try:
            notes = parse_mscx_lyric_notes(path)
            fx, fy = lieder_feature_rows(notes)
        except Exception:
            continue
        if not fx:
            continue
        xs.extend(fx)
        ys.extend(fy)
        n_songs += 1
    if not xs:
        from calliope.audio.vocal_melody_ml import N_FEATURES

        return np.zeros((0, N_FEATURES), dtype=np.float32), np.zeros((0,), dtype=np.float32), 0
    return np.stack(xs).astype(np.float32), np.asarray(ys, dtype=np.float32), n_songs
