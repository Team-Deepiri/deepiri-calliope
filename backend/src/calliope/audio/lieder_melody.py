"""OpenScore Lieder (CC0): MuseScore lyrics-on-notes → melody training rows."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from calliope.audio.vocal_synth import (
    GENRE_PALETTE,
    VOICE_RANGES,
    _NOTE_TO_MIDI,
    _SCALES,
    _scale_pitches,
)

_DURATION_BEATS = {
    "longa": 16.0,
    "breve": 8.0,
    "whole": 4.0,
    "half": 2.0,
    "quarter": 1.0,
    "eighth": 0.5,
    "16th": 0.25,
    "32nd": 0.125,
    "64th": 0.0625,
    "128th": 0.03125,
}
_PC_TO_NOTE = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
_MAJOR_IV = (0, 2, 4, 5, 7, 9, 11)
_MINOR_IV = (0, 2, 3, 5, 7, 8, 10)
INTERVAL_CLIP = 5.0


@dataclass(frozen=True)
class LyricNote:
    tok: str
    midi: int
    phrase_end: bool
    beats: float = 0.5


@dataclass(frozen=True)
class ParsedSong:
    path: Path
    notes: list[LyricNote]
    root: str
    scale: str


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _first_staff_with_lyrics(root: ET.Element) -> ET.Element | None:
    for staff in root.iter():
        if _local(staff.tag) != "Staff":
            continue
        if any(_local(el.tag) == "Lyrics" for el in staff.iter()):
            return staff
    return None


def _text_int(el: ET.Element | None, default: int = 0) -> int:
    if el is None or not (el.text or "").strip():
        return default
    try:
        return int(float(el.text.strip()))
    except ValueError:
        return default


def event_beats(el: ET.Element, sig_n: int = 4, sig_d: int = 4) -> float:
    """Quarter-note beats from a MuseScore Chord or Rest."""
    dt = ""
    dots = 0
    for child in list(el):
        name = _local(child.tag)
        if name == "durationType" and child.text:
            dt = child.text.strip()
        elif name == "dots" and child.text:
            dots = _text_int(child, 0)
    if dt == "measure":
        beats = sig_n * (4.0 / max(sig_d, 1))
    else:
        beats = _DURATION_BEATS.get(dt, 0.5)
    extra = 0.0
    add = beats * 0.5
    for _ in range(max(0, dots)):
        extra += add
        add *= 0.5
    return float(max(0.0625, beats + extra))


def fifths_to_major_root(fifths: int) -> str:
    pc = (int(fifths) * 7) % 12
    return _PC_TO_NOTE[pc]


def infer_key(fifths: int, midis: list[int]) -> tuple[str, str]:
    """Pick major vs relative minor from how well vocal pitch classes fit."""
    major_pc = (int(fifths) * 7) % 12
    minor_pc = (major_pc - 3) % 12
    major_set = {(major_pc + i) % 12 for i in _MAJOR_IV}
    minor_set = {(minor_pc + i) % 12 for i in _MINOR_IV}
    pcs = [int(m) % 12 for m in midis]
    maj_fit = sum(1 for p in pcs if p in major_set)
    min_fit = sum(1 for p in pcs if p in minor_set)
    if min_fit > maj_fit:
        return _PC_TO_NOTE[minor_pc], "minor"
    return _PC_TO_NOTE[major_pc], "major"


def duration_log(beats: float) -> float:
    b = float(np.clip(beats, 0.25, 4.0))
    return float(np.log2(b / 0.5))


def log_to_beats(log_dur: float) -> float:
    b = 0.5 * (2.0 ** float(np.clip(log_dur, -1.0, 3.0)))
    return float(np.clip(b, 0.25, 4.0))


def _lyric_from_chord(chord: ET.Element) -> tuple[str, str] | None:
    """Return (token, raw_text) for verse 0, or None."""
    lyric_el = None
    for child in list(chord):
        if _local(child.tag) != "Lyrics":
            continue
        no = None
        for sub in list(child):
            if _local(sub.tag) == "no":
                no = sub
                break
        if no is not None and (no.text or "0").strip() not in {"0", ""}:
            continue
        lyric_el = child
    if lyric_el is None:
        return None
    text_el = None
    for sub in list(lyric_el):
        if _local(sub.tag) == "text":
            text_el = sub
            break
    raw = "".join(text_el.itertext()) if text_el is not None else ""
    tok = "".join(ch for ch in raw.lower() if ch.isalnum() or ch in "'’‘")
    if not tok:
        return None
    return tok, raw


def _chord_midi(chord: ET.Element) -> int | None:
    pitches: list[int] = []
    for child in list(chord):
        if _local(child.tag) != "Note":
            continue
        p = None
        for sub in list(child):
            if _local(sub.tag) == "pitch":
                p = sub
                break
        if p is not None and p.text and p.text.strip().lstrip("-").isdigit():
            pitches.append(int(p.text.strip()))
    return max(pitches) if pitches else None


def _is_grace(chord: ET.Element) -> bool:
    return any(_local(c.tag) in {"grace", "appoggiatura", "acciaccatura"} for c in chord)


def _voice_for_measure(measure: ET.Element) -> ET.Element:
    voices = [c for c in list(measure) if _local(c.tag) == "voice"]
    if not voices:
        return measure

    def n_lyrics(v: ET.Element) -> int:
        return sum(1 for e in v.iter() if _local(e.tag) == "Lyrics")

    return max(voices, key=n_lyrics)


def parse_mscx_song(path: Path) -> ParsedSong | None:
    """Parse the first lyric staff: notes, durations, rests, and key."""
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return None
    staff = _first_staff_with_lyrics(tree.getroot())
    if staff is None:
        return None

    fifths = 0
    sig_n, sig_d = 4, 4
    notes: list[LyricNote] = []
    current: tuple[str, int, bool, float] | None = None

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        tok, midi, phrase_end, beats = current
        notes.append(LyricNote(tok, midi, phrase_end, float(min(4.0, max(0.25, beats)))))
        current = None

    for measure in list(staff):
        if _local(measure.tag) != "Measure":
            continue
        voice = _voice_for_measure(measure)
        for el in list(voice):
            name = _local(el.tag)
            if name == "KeySig":
                for sub in list(el):
                    if _local(sub.tag) == "accidental":
                        fifths = _text_int(sub, fifths)
            elif name == "TimeSig":
                n_el = d_el = None
                for sub in list(el):
                    loc = _local(sub.tag)
                    if loc == "sigN":
                        n_el = sub
                    elif loc == "sigD":
                        d_el = sub
                sig_n = _text_int(n_el, sig_n)
                sig_d = _text_int(d_el, sig_d)
            elif name == "Rest":
                beats = event_beats(el, sig_n, sig_d)
                if current is not None and beats >= 0.5:
                    tok, midi, _end, cur_beats = current
                    current = (tok, midi, True, cur_beats)
                flush()
            elif name == "Chord":
                if _is_grace(el):
                    continue
                midi = _chord_midi(el)
                if midi is None:
                    continue
                beats = event_beats(el, sig_n, sig_d)
                lyric = _lyric_from_chord(el)
                if lyric is not None:
                    flush()
                    tok, raw = lyric
                    punct = any(ch in raw for ch in ".!?;:")
                    current = (tok, midi, punct, beats)
                elif current is not None and not any(_local(c.tag) == "Lyrics" for c in list(el)):
                    tok, prev_midi, phrase_end, cur_beats = current
                    current = (tok, prev_midi, phrase_end, min(4.0, cur_beats + beats))

    flush()
    if notes:
        last = notes[-1]
        notes[-1] = LyricNote(last.tok, last.midi, True, last.beats)
    if len(notes) < 1:
        return None
    root, scale = infer_key(fifths, [n.midi for n in notes])
    return ParsedSong(path=path, notes=notes, root=root, scale=scale)


def parse_mscx_lyric_notes(path: Path) -> list[LyricNote]:
    song = parse_mscx_song(path)
    return list(song.notes) if song else []


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
    notes: list[LyricNote],
    *,
    root: str = "G",
    scale: str = "major",
    genre_preset: str = "acoustic",
    arrangement_style: str = "through-composed",
    voice_name: str | None = None,
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Build (X, y) examples: y is [scale-step interval, duration log]."""
    from calliope.audio.vocal_melody_ml import syllable_features

    if len(notes) < 6:
        return [], []
    notes = notes[:80]
    voice = voice_name or voice_for_midis([n.midi for n in notes])
    lo, hi = VOICE_RANGES.get(voice, VOICE_RANGES["soprano"])
    pal = GENRE_PALETTE.get(genre_preset, GENRE_PALETTE["acoustic"])
    root_midi = _NOTE_TO_MIDI.get(root, _NOTE_TO_MIDI.get(str(pal["root"]), 67))
    intervals = _SCALES.get(scale, _SCALES.get(str(pal["scale"]), _SCALES["major"]))
    pool = _scale_pitches(root_midi, intervals, lo, hi)
    phrase_idx = 0
    n_phrases = 1 + sum(1 for n in notes[:-1] if n.phrase_end)
    n = len(notes)
    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    prev = float(len(pool) // 2)
    prev2 = prev
    for i, note in enumerate(notes):
        feat = syllable_features(
            tok=note.tok,
            i=i,
            n=n,
            phrase_idx=phrase_idx,
            n_phrases=max(1, n_phrases),
            phrase_end=note.phrase_end,
            phrase_start=i == 0 or (i > 0 and notes[i - 1].phrase_end),
            genre_preset=genre_preset,
            arrangement_style=arrangement_style,
            prev_idx=prev,
            prev2_idx=prev2,
            pool_len=len(pool),
            lo=lo,
            hi=hi,
        )
        idx = nearest_pool_index(note.midi, pool)
        delta = float(np.clip(idx - prev, -INTERVAL_CLIP, INTERVAL_CLIP))
        xs.append(feat)
        ys.append(np.array([delta, duration_log(note.beats)], dtype=np.float32))
        prev2 = prev
        prev = float(idx)
        if note.phrase_end:
            phrase_idx += 1
    return xs, ys


def iter_mscx(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.mscx") if p.is_file())


def iter_parsed_songs(root: Path) -> list[ParsedSong]:
    songs: list[ParsedSong] = []
    for path in iter_mscx(root):
        try:
            song = parse_mscx_song(path)
        except Exception:
            continue
        if song is None or len(song.notes) < 6:
            continue
        songs.append(song)
    return songs


def collect_lieder_dataset(root: Path) -> tuple[np.ndarray, np.ndarray, int]:
    """Load all parseable scores. Returns X, y (n, 2), n_songs."""
    from calliope.audio.vocal_melody_ml import N_FEATURES, N_OUTPUTS

    xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    n_songs = 0
    for song in iter_parsed_songs(root):
        fx, fy = lieder_feature_rows(song.notes, root=song.root, scale=song.scale)
        if not fx:
            continue
        xs.extend(fx)
        ys.extend(fy)
        n_songs += 1
    if not xs:
        return (
            np.zeros((0, N_FEATURES), dtype=np.float32),
            np.zeros((0, N_OUTPUTS), dtype=np.float32),
            0,
        )
    return np.stack(xs).astype(np.float32), np.stack(ys).astype(np.float32), n_songs
