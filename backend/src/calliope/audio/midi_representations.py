"""REMI, MuMIDI, CP, and OctupleMIDI encodings for symbolic music tokenization."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Any

PAD_TOKEN = 0
SOS_TOKEN = 1
EOS_TOKEN = 2
MASK_TOKEN = 3
VOCAB_SIZE = 4096

PITCH_OFFSET = 4
VELOCITY_OFFSET = 128
DURATION_OFFSET = 256
POSITION_OFFSET = 384
BAR_OFFSET = 512
TEMPO_OFFSET = 640
CHORD_OFFSET = 768
PROGRAM_OFFSET = 960
TIMESIG_OFFSET = 1088

MAX_BARS = 256
MAX_POSITIONS = 64
MAX_DURATION = 64
MAX_VELOCITY = 128
MAX_PITCH = 128


@dataclass(frozen=True)
class NoteToken:
    bar: int = 0
    position: float = 0.0
    pitch: int = 60
    velocity: int = 80
    duration: float = 0.25
    program: int = 0
    chord: str = "N"
    tempo: float = 120.0
    time_sig: tuple[int, int] = (4, 4)

    def to_dict(self) -> dict[str, Any]:
        return {
            "bar": self.bar,
            "position": self.position,
            "pitch": self.pitch,
            "velocity": self.velocity,
            "duration": self.duration,
            "program": self.program,
            "chord": self.chord,
            "tempo": self.tempo,
            "time_sig": self.time_sig,
        }


def _remi_encode(note: NoteToken) -> list[int]:
    tokens: list[int] = []
    bar_id = min(note.bar, MAX_BARS - 1)
    pos = min(int(note.position * 4), MAX_POSITIONS - 1)
    pitch = min(note.pitch, MAX_PITCH - 1)
    vel = min(note.velocity, MAX_VELOCITY - 1)
    dur = min(int(note.duration * 4), MAX_DURATION - 1)

    tokens.append(BAR_OFFSET + bar_id)
    tokens.append(POSITION_OFFSET + pos)
    tokens.append(PITCH_OFFSET + pitch)
    tokens.append(VELOCITY_OFFSET + vel)
    tokens.append(DURATION_OFFSET + dur)
    return tokens


def _remi_decode(tokens: list[int], idx: int) -> tuple[NoteToken | None, int]:
    if idx >= len(tokens) - 4:
        return None, idx + 1
    if not (BAR_OFFSET <= tokens[idx] < BAR_OFFSET + MAX_BARS):
        return None, idx + 1
    bar = tokens[idx] - BAR_OFFSET
    if not (POSITION_OFFSET <= tokens[idx + 1] < POSITION_OFFSET + MAX_POSITIONS):
        return None, idx + 1
    pos = (tokens[idx + 1] - POSITION_OFFSET) / 4.0
    if not (PITCH_OFFSET <= tokens[idx + 2] < PITCH_OFFSET + MAX_PITCH):
        return None, idx + 1
    pitch = tokens[idx + 2] - PITCH_OFFSET
    if not (VELOCITY_OFFSET <= tokens[idx + 3] < VELOCITY_OFFSET + MAX_VELOCITY):
        return None, idx + 1
    vel = tokens[idx + 3] - VELOCITY_OFFSET
    if not (DURATION_OFFSET <= tokens[idx + 4] < DURATION_OFFSET + MAX_DURATION):
        return None, idx + 1
    dur = (tokens[idx + 4] - DURATION_OFFSET) / 4.0
    return NoteToken(bar=bar, position=pos, pitch=pitch, velocity=vel, duration=dur), idx + 5


def _mumidi_encode(note: NoteToken) -> list[int]:
    tokens: list[int] = []
    bar_id = min(note.bar, MAX_BARS - 1)
    pos = min(int(note.position * 4), MAX_POSITIONS - 1)
    tokens.append(BAR_OFFSET + bar_id)
    tokens.append(POSITION_OFFSET + pos)
    chord_idx = abs(hash(note.chord)) % 128
    tokens.append(CHORD_OFFSET + chord_idx)
    tokens.append(PROGRAM_OFFSET + note.program)
    tokens.append(PITCH_OFFSET + min(note.pitch, MAX_PITCH - 1))
    tokens.append(VELOCITY_OFFSET + min(note.velocity, MAX_VELOCITY - 1))
    tokens.append(DURATION_OFFSET + min(int(note.duration * 4), MAX_DURATION - 1))
    return tokens


def _mumidi_decode(tokens: list[int], idx: int) -> tuple[NoteToken | None, int]:
    if idx >= len(tokens) - 6:
        return None, idx + 1
    if not (BAR_OFFSET <= tokens[idx] < BAR_OFFSET + MAX_BARS):
        return None, idx + 1
    bar = tokens[idx] - BAR_OFFSET
    if not (POSITION_OFFSET <= tokens[idx + 1] < POSITION_OFFSET + MAX_POSITIONS):
        return None, idx + 1
    pos = (tokens[idx + 1] - POSITION_OFFSET) / 4.0
    chord = f"C{((tokens[idx + 2] - CHORD_OFFSET) % 12) if CHORD_OFFSET <= tokens[idx + 2] < CHORD_OFFSET + 128 else 0}"
    program = (tokens[idx + 3] - PROGRAM_OFFSET) if PROGRAM_OFFSET <= tokens[idx + 3] < PROGRAM_OFFSET + 128 else 0
    pitch = (tokens[idx + 4] - PITCH_OFFSET) if PITCH_OFFSET <= tokens[idx + 4] < PITCH_OFFSET + MAX_PITCH else 60
    vel = (tokens[idx + 5] - VELOCITY_OFFSET) if VELOCITY_OFFSET <= tokens[idx + 5] < VELOCITY_OFFSET + MAX_VELOCITY else 80
    dur = ((tokens[idx + 6] - DURATION_OFFSET) / 4.0) if DURATION_OFFSET <= tokens[idx + 6] < DURATION_OFFSET + MAX_DURATION else 0.25
    return NoteToken(bar=bar, position=pos, pitch=pitch, velocity=vel, duration=dur, program=program, chord=chord), idx + 7


def _octuple_encode(note: NoteToken) -> list[int]:
    bar_id = min(note.bar, MAX_BARS - 1)
    pos = min(int(note.position * 4), MAX_POSITIONS - 1)
    pitch = min(note.pitch, MAX_PITCH - 1)
    vel = min(note.velocity, MAX_VELOCITY - 1)
    dur = min(int(note.duration * 4), MAX_DURATION - 1)

    ts_num, ts_den = note.time_sig
    ts_idx = (ts_num - 1) * 3 + (int(np.log2(ts_den)) if ts_den else 0)
    tempo_idx = min(int((note.tempo - 20) / 2), 127)

    bar_tok = BAR_OFFSET + bar_id
    ts_tok = TIMESIG_OFFSET + min(ts_idx, 127)
    pos_tok = POSITION_OFFSET + pos
    tempo_tok = TEMPO_OFFSET + tempo_idx
    prog_tok = PROGRAM_OFFSET + note.program
    pitch_tok = PITCH_OFFSET + pitch
    dur_tok = DURATION_OFFSET + dur
    vel_tok = VELOCITY_OFFSET + vel
    return [bar_tok, ts_tok, pos_tok, tempo_tok, prog_tok, pitch_tok, dur_tok, vel_tok]


def _octuple_decode(tokens: list[int], idx: int) -> tuple[NoteToken | None, int]:
    if idx >= len(tokens) - 7:
        return None, idx + 1
    if not (BAR_OFFSET <= tokens[idx] < BAR_OFFSET + MAX_BARS):
        return None, idx + 1
    bar = tokens[idx] - BAR_OFFSET
    ts_idx = (tokens[idx + 1] - TIMESIG_OFFSET) if TIMESIG_OFFSET <= tokens[idx + 1] < TIMESIG_OFFSET + 128 else 24
    ts_num = (ts_idx // 3) + 1
    ts_den = 2 ** (ts_idx % 3)
    pos = ((tokens[idx + 2] - POSITION_OFFSET) / 4.0) if POSITION_OFFSET <= tokens[idx + 2] < POSITION_OFFSET + MAX_POSITIONS else 0.0
    tempo = ((tokens[idx + 3] - TEMPO_OFFSET) * 2 + 20) if TEMPO_OFFSET <= tokens[idx + 3] < TEMPO_OFFSET + 128 else 120.0
    program = (tokens[idx + 4] - PROGRAM_OFFSET) if PROGRAM_OFFSET <= tokens[idx + 4] < PROGRAM_OFFSET + 128 else 0
    pitch = (tokens[idx + 5] - PITCH_OFFSET) if PITCH_OFFSET <= tokens[idx + 5] < PITCH_OFFSET + MAX_PITCH else 60
    dur = ((tokens[idx + 6] - DURATION_OFFSET) / 4.0) if DURATION_OFFSET <= tokens[idx + 6] < DURATION_OFFSET + MAX_DURATION else 0.25
    vel = (tokens[idx + 7] - VELOCITY_OFFSET) if VELOCITY_OFFSET <= tokens[idx + 7] < VELOCITY_OFFSET + MAX_VELOCITY else 80
    return NoteToken(bar=bar, position=pos, pitch=pitch, velocity=vel, duration=dur, program=program, tempo=tempo, time_sig=(ts_num, ts_den)), idx + 8


def encode_note_sequence(notes: list[NoteToken], encoding: str = "remi") -> list[int]:
    encoding = encoding.lower()
    if encoding == "remi":
        encoder = _remi_encode
    elif encoding == "mumidi":
        encoder = _mumidi_encode
    elif encoding == "octuple":
        encoder = _octuple_encode
    elif encoding == "cp":
        encoder = _cp_encode
    else:
        raise ValueError(f"Unknown encoding: {encoding}")

    tokens: list[int] = [SOS_TOKEN]
    for note in notes:
        tokens.extend(encoder(note))
    tokens.append(EOS_TOKEN)
    return tokens


def decode_token_sequence(tokens: list[int], encoding: str = "remi") -> list[NoteToken]:
    encoding = encoding.lower()
    if encoding == "remi":
        decoder = _remi_decode
    elif encoding == "mumidi":
        decoder = _mumidi_decode
    elif encoding == "octuple":
        decoder = _octuple_decode
    elif encoding == "cp":
        decoder = _cp_decode
    else:
        raise ValueError(f"Unknown encoding: {encoding}")

    notes: list[NoteToken] = []
    i = 0
    while i < len(tokens):
        if tokens[i] in (PAD_TOKEN, SOS_TOKEN, EOS_TOKEN, MASK_TOKEN):
            i += 1
            continue
        note, i = decoder(tokens, i)
        if note is not None:
            notes.append(note)
    return notes


def _cp_encode(note: NoteToken) -> list[int]:
    bar_id = min(note.bar, MAX_BARS - 1)
    pos = min(int(note.position * 4), MAX_POSITIONS - 1)
    pitch = min(note.pitch, MAX_PITCH - 1)
    vel = min(note.velocity, MAX_VELOCITY - 1)
    dur = min(int(note.duration * 4), MAX_DURATION - 1)

    metric_tokens = [BAR_OFFSET + bar_id, POSITION_OFFSET + pos]
    note_tokens = [PITCH_OFFSET + pitch, VELOCITY_OFFSET + vel, DURATION_OFFSET + dur]
    return metric_tokens + note_tokens


def _cp_decode(tokens: list[int], idx: int) -> tuple[NoteToken | None, int]:
    if idx >= len(tokens) - 4:
        return None, idx + 1
    if not (BAR_OFFSET <= tokens[idx] < BAR_OFFSET + MAX_BARS):
        return None, idx + 1
    bar = tokens[idx] - BAR_OFFSET
    if not (POSITION_OFFSET <= tokens[idx + 1] < POSITION_OFFSET + MAX_POSITIONS):
        return None, idx + 1
    pos = (tokens[idx + 1] - POSITION_OFFSET) / 4.0
    if not (PITCH_OFFSET <= tokens[idx + 2] < PITCH_OFFSET + MAX_PITCH):
        return None, idx + 1
    pitch = tokens[idx + 2] - PITCH_OFFSET
    if not (VELOCITY_OFFSET <= tokens[idx + 3] < VELOCITY_OFFSET + MAX_VELOCITY):
        return None, idx + 1
    vel = tokens[idx + 3] - VELOCITY_OFFSET
    if not (DURATION_OFFSET <= tokens[idx + 4] < DURATION_OFFSET + MAX_DURATION):
        return None, idx + 1
    dur = (tokens[idx + 4] - DURATION_OFFSET) / 4.0
    return NoteToken(bar=bar, position=pos, pitch=pitch, velocity=vel, duration=dur), idx + 5


def tokens_to_onehot(tokens: list[int], vocab_size: int = VOCAB_SIZE) -> np.ndarray:
    arr = np.zeros((len(tokens), vocab_size), dtype=np.float32)
    arr[np.arange(len(tokens)), tokens] = 1.0
    return arr


def onehot_to_tokens(onehot: np.ndarray) -> list[int]:
    return list(np.argmax(onehot, axis=-1))
