"""Formant singing-voice synthesis (SVS) from lyrics and a MIDI melody.

This is a source-filter singer, not a neural model: a pulse/saw source is
shaped by vowel formants so lyrics actually change the timbre. Good enough
for a Studio demo; not DiffSinger/Suno-quality.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
from scipy.signal import butter, lfilter

_WORD_RE = re.compile(r"[A-Za-z']+")
_SYLLABLE_RE = re.compile(r"[^aeiouy]*[aeiouy]+[^aeiouy]*", re.IGNORECASE)
_PHRASE_RE = re.compile(r"[,.\n;!?]+")

VOWEL_FORMANTS: dict[str, tuple[float, float, float]] = {
    "a": (800, 1200, 2500),
    "e": (400, 2200, 3000),
    "i": (300, 2500, 3500),
    "o": (500, 800, 2400),
    "u": (300, 700, 2300),
    "y": (350, 2100, 2800),
}

VOICE_RANGES: dict[str, tuple[int, int]] = {
    "soprano": (64, 81),
    "tenor": (48, 67),
    "alt": (55, 74),
    "alto": (55, 74),
    "bass": (40, 55),
}

GENRE_PALETTE: dict[str, dict[str, str | int]] = {
    "pop": {"root": "C", "scale": "major", "mood": "happy", "bpm": 118},
    "rock": {"root": "E", "scale": "minor", "mood": "dark", "bpm": 126},
    "r&b": {"root": "A", "scale": "minor", "mood": "sad", "bpm": 88},
    "electronic": {"root": "F", "scale": "minor", "mood": "dark", "bpm": 124},
    "acoustic": {"root": "G", "scale": "major", "mood": "happy", "bpm": 96},
    "hiphop": {"root": "C", "scale": "minor", "mood": "dark", "bpm": 92},
    "jazz": {"root": "D", "scale": "dorian", "mood": "jazz", "bpm": 108},
}

_NOTE_TO_MIDI = {
    "C": 60,
    "C#": 61,
    "D": 62,
    "D#": 63,
    "E": 64,
    "F": 65,
    "F#": 66,
    "G": 67,
    "G#": 68,
    "A": 69,
    "A#": 70,
    "B": 71,
}

_SCALES: dict[str, list[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
}

MelodyNote = tuple[int, float, float]  # midi, start_sec, duration_sec


@dataclass
class VocalVoiceConfig:
    name: str
    gender: str = "neutral"
    brightness: float = 0.5
    vibrato_rate: float = 5.5
    vibrato_depth: float = 0.2


def lyric_tokens(lyrics: str) -> list[str]:
    """Split lyrics into approximate sung syllables."""
    tokens: list[str] = []
    for word in _WORD_RE.findall(lyrics or ""):
        parts = [p.lower() for p in _SYLLABLE_RE.findall(word) if p]
        tokens.extend(parts or [word.lower()])
    return tokens or ["la"]


def lyric_phrases(lyrics: str) -> list[list[str]]:
    phrases: list[list[str]] = []
    for chunk in _PHRASE_RE.split(lyrics or ""):
        toks = lyric_tokens(chunk) if _WORD_RE.search(chunk or "") else []
        if toks:
            phrases.append(toks)
    return phrases or [lyric_tokens(lyrics)]


def _scale_pitches(root_midi: int, intervals: list[int], lo: int, hi: int) -> list[int]:
    pitches: list[int] = []
    for octv in range(-3, 4):
        for iv in intervals:
            p = root_midi + iv + octv * 12
            if lo <= p <= hi:
                pitches.append(p)
    return pitches or [int(np.clip(root_midi, lo, hi))]


def _clamp_midi(midi: int, lo: int, hi: int) -> int:
    while midi < lo:
        midi += 12
    while midi > hi:
        midi -= 12
    return int(np.clip(midi, lo, hi))


def melody_from_lyrics(
    lyrics: str,
    *,
    voice_name: str = "soprano",
    genre_preset: str = "pop",
    arrangement_style: str = "verse-chorus",
    vocal_style: str = "lead",
    bpm: float | None = None,
    max_syllables: int = 48,
) -> list[MelodyNote]:
    """Build a sung melody timed to lyric syllables.

    Times are in seconds so they can go straight into ``AIVocalSynthesizer``.
    """
    palette = GENRE_PALETTE.get(genre_preset.lower(), GENRE_PALETTE["pop"])
    use_bpm = float(bpm or palette["bpm"])
    beat = 60.0 / max(40.0, use_bpm)
    lo, hi = VOICE_RANGES.get(voice_name, VOICE_RANGES["soprano"])
    root = _NOTE_TO_MIDI.get(str(palette["root"]), 60)
    intervals = _SCALES.get(str(palette["scale"]), _SCALES["major"])
    pool = _scale_pitches(root, intervals, lo, hi)
    mid = len(pool) // 2

    phrases = lyric_phrases(lyrics)
    flat: list[tuple[str, int, bool]] = []  # token, phrase_idx, phrase_end
    for pi, toks in enumerate(phrases):
        for ti, tok in enumerate(toks):
            flat.append((tok, pi, ti == len(toks) - 1))
    flat = flat[:max_syllables]
    if not flat:
        flat = [("la", 0, True)]

    density = 0.55 if vocal_style == "ad-libs" else 1.0
    eighth = beat * 0.5
    melody: list[MelodyNote] = []
    t = 0.0
    idx = mid
    n_phrases = max(1, len(phrases))
    chorus_lift = 4 if arrangement_style in {"verse-chorus", "verse-chorus-bridge"} else 0

    for i, (_tok, phrase_idx, phrase_end) in enumerate(flat):
        if density < 1.0 and i % 3 == 1:
            t += eighth
            continue
        step = 1 if (i % 4) in (0, 1) else -1
        if i % 7 == 0:
            step = 2
        idx = int(np.clip(idx + step, 0, len(pool) - 1))
        midi = pool[idx]
        # Chorus / later phrases sit higher in the voice.
        section_lift = 0
        if arrangement_style == "verse-chorus" and phrase_idx >= max(1, n_phrases // 2):
            section_lift = chorus_lift
        elif arrangement_style == "verse-chorus-bridge" and phrase_idx >= n_phrases - 1:
            section_lift = 2
        elif arrangement_style == "through-composed":
            section_lift = min(7, phrase_idx)
        midi = _clamp_midi(midi + section_lift, lo, hi)
        dur = eighth * (2.0 if phrase_end else 1.0)
        if vocal_style == "ad-libs":
            dur *= 0.7
        melody.append((midi, t, dur))
        t += dur + (eighth * 0.25 if phrase_end else 0.0)

    if arrangement_style == "strophic" and melody:
        loop_len = melody[-1][1] + melody[-1][2] + beat
        extra = [(m, s + loop_len, d) for m, s, d in melody]
        melody.extend(extra)

    return melody


def signal_sawtooth(phase: np.ndarray) -> np.ndarray:
    return 2 * (phase / (2 * np.pi) % 1) - 1


def _adsr(n: int, sr: int, attack: float = 0.04, decay: float = 0.08, sustain: float = 0.82, release: float = 0.12) -> np.ndarray:
    """Vectorized ADSR; always the same length as the note."""
    n = max(1, n)
    env = np.full(n, sustain, dtype=np.float64)
    a = min(n, max(1, int(attack * sr)))
    d = min(max(0, n - a), max(1, int(decay * sr)))
    r = min(n, max(1, int(release * sr)))
    env[:a] = np.linspace(0.0, 1.0, a, endpoint=True)
    if d > 0 and a + d <= n:
        env[a : a + d] = np.linspace(1.0, sustain, d, endpoint=True)
    env[-r:] *= np.linspace(1.0, 0.0, r, endpoint=True)
    return env


class AIVocalSynthesizer:
    """Formant (source-filter) singing synthesizer."""

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.voices = {
            "soprano": VocalVoiceConfig("Soprano", "female", 0.7, 6.0, 0.3),
            "tenor": VocalVoiceConfig("Tenor", "male", 0.5, 5.0, 0.2),
            "alt": VocalVoiceConfig("Alt", "female", 0.4, 5.5, 0.2),
            "alto": VocalVoiceConfig("Alto", "female", 0.4, 5.5, 0.2),
            "bass": VocalVoiceConfig("Bass", "male", 0.25, 4.5, 0.15),
        }

    def synthesize(
        self,
        lyrics: str,
        melody: list[MelodyNote],
        voice_name: str = "soprano",
        *,
        vocal_style: str = "lead",
        max_seconds: float = 40.0,
    ) -> np.ndarray:
        """Render singing audio from lyrics and (midi, start, duration) melody."""
        if not melody:
            return np.zeros(int(0.25 * self.sr), dtype=np.float64)

        voice = self.voices.get(voice_name, self.voices["soprano"])
        tokens = lyric_tokens(lyrics)
        total_duration = min(max_seconds, max(m[1] + m[2] for m in melody) + 0.35)
        n_out = max(1, int(total_duration * self.sr))
        output = np.zeros(n_out, dtype=np.float64)

        layers = [(0, 1.0)]
        if vocal_style == "harmonies":
            layers.append((7, 0.38))
        elif vocal_style == "choir":
            layers.extend([(7, 0.32), (12, 0.22), (-12, 0.18)])

        for midi_off, gain in layers:
            layer = self._render_layer(tokens, melody, voice, midi_off, n_out)
            output += layer * gain

        peak = float(np.max(np.abs(output)))
        if peak > 1e-9:
            output = output / peak * 0.85
        return output.astype(np.float64)

    def _render_layer(
        self,
        tokens: list[str],
        melody: list[MelodyNote],
        voice: VocalVoiceConfig,
        midi_offset: int,
        n_out: int,
    ) -> np.ndarray:
        output = np.zeros(n_out, dtype=np.float64)
        rng = np.random.default_rng(7)

        for i, (midi, start, duration) in enumerate(melody):
            token = tokens[i % len(tokens)]
            vowel = next((c for c in token if c in VOWEL_FORMANTS), "a")
            formants = VOWEL_FORMANTS[vowel]
            freq = 440.0 * 2.0 ** (((midi + midi_offset) - 69.0) / 12.0)
            n_samples = max(1, int(duration * self.sr))
            t = np.arange(n_samples, dtype=np.float64) / self.sr
            vibrato = np.sin(2 * np.pi * voice.vibrato_rate * t) * voice.vibrato_depth
            vibrato_freq = freq * (2.0 ** (vibrato / 12.0))
            phase = 2 * np.pi * np.cumsum(vibrato_freq) / self.sr
            breath = 0.04 + 0.04 * voice.brightness
            source = signal_sawtooth(phase) + breath * rng.standard_normal(n_samples)
            filtered = self._apply_vocal_tract(source, formants)
            envelope = _adsr(n_samples, self.sr)
            start_sample = int(start * self.sr)
            end_sample = min(n_out, start_sample + n_samples)
            if start_sample >= n_out or end_sample <= start_sample:
                continue
            take = end_sample - start_sample
            output[start_sample:end_sample] += filtered[:take] * envelope[:take]

        return output

    def _apply_vocal_tract(self, source: np.ndarray, formants: tuple[float, float, float]) -> np.ndarray:
        """Resonant bandpass stack approximating vowel formants."""
        nyq = self.sr / 2.0
        mixed = source.astype(np.float64) * 0.35
        for f in formants:
            f_norm = float(np.clip(f / nyq, 0.02, 0.92))
            low = float(np.clip(f_norm * 0.88, 0.01, 0.97))
            high = float(np.clip(f_norm * 1.12, low + 0.01, 0.99))
            try:
                b, a = butter(2, [low, high], btype="bandpass")
                mixed = mixed + lfilter(b, a, source) * 1.6
            except ValueError:
                continue
        peak = float(np.max(np.abs(mixed)))
        if peak > 1e-9:
            mixed = mixed / peak
        return mixed
