"""Loop database and catalog with search, filtering, and similarity matching."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


LOOP_CATEGORIES = [
    "drums", "bass", "synth", "fx", "vocals",
    "percussion", "melody", "pads", "arp",
]


@dataclass
class LoopEntry:
    id: str
    name: str
    bpm: float = 120.0
    key: str = "C"
    tags: list[str] = field(default_factory=list)
    category: str = "drums"
    duration: float = 4.0
    path: str = ""
    waveform_data: np.ndarray | None = None


_LOOP_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_LOOP_KEY_VALUES = {k: i for i, k in enumerate(_LOOP_KEYS)}

BUILTIN_LOOPS: list[LoopEntry] = [
    LoopEntry("dk_4onfloor", "4-on-the-floor Kick", 128, "C", ["kick", "four", "floor", "punchy"], "drums", 4.0),
    LoopEntry("dk_house_beat", "House Beat", 126, "G", ["house", "beat", "groove"], "drums", 8.0),
    LoopEntry("dk_trap_beat", "Trap Beat", 140, "A#", ["trap", "hihat", "808", "snare"], "drums", 4.0),
    LoopEntry("dk_techno_loop", "Techno Groove", 130, "D", ["techno", "driving", "industrial"], "drums", 8.0),
    LoopEntry("dk_breakbeat", "Breakbeat Classic", 170, "F", ["breakbeat", "drum_and_bass", "jungle"], "drums", 4.0),
    LoopEntry("bs_sub_octave", "Sub Octave Bass", 128, "C", ["sub", "deep", "808"], "bass", 4.0),
    LoopEntry("bs_acid_line", "Acid Bassline", 130, "G#", ["acid", "303", "squelch"], "bass", 8.0),
    LoopEntry("bs_reese", "Reese Bass", 140, "D#", ["reese", "dark", "wobble"], "bass", 4.0),
    LoopEntry("syn_lead_pluck", "Pluck Lead", 128, "C", ["pluck", "lead", "bright"], "synth", 4.0),
    LoopEntry("syn_arp_octaves", "Octave Arp", 132, "E", ["arpeggio", "synth", "shimmer"], "synth", 4.0),
    LoopEntry("fx_riser", "Riser FX", 120, "C", ["riser", "build", "impact", "sweep"], "fx", 8.0),
    LoopEntry("fx_downlifter", "Downlifter", 120, "C", ["downlifter", "transition", "fall"], "fx", 4.0),
    LoopEntry("fx_noise_sweep", "Noise Sweep", 128, "C", ["noise", "sweep", "white"], "fx", 4.0),
    LoopEntry("vox_hook", "Vocal Hook Oh", 124, "G", ["vocal", "hook", "oh", "phrase"], "vocals", 4.0),
    LoopEntry("vox_adlibs", "Vocal Adlibs", 128, "C", ["adlib", "chopped", "stutter"], "vocals", 4.0),
    LoopEntry("perc_shakers", "Shakers", 128, "C", ["shaker", "percussion", "groove"], "percussion", 4.0),
    LoopEntry("perc_tambourine", "Tambourine", 120, "C", ["tambourine", "percussion"], "percussion", 2.0),
    LoopEntry("mel_piano_loop", "Piano Loop", 90, "A#", ["piano", "melodic", "chords"], "melody", 8.0),
    LoopEntry("mel_guitar_strum", "Guitar Strum", 100, "E", ["guitar", "acoustic", "strum"], "melody", 4.0),
    LoopEntry("pad_atmos", "Atmospheric Pad", 80, "F#", ["pad", "ambient", "atmospheric", "texture"], "pads", 8.0),
    LoopEntry("pad_warm", "Warm Pad", 120, "C", ["pad", "warm", "soft"], "pads", 4.0),
    LoopEntry("arp_shimmer", "Shimmer Arp", 128, "C", ["arp", "shimmer", "bright", "hihat"], "arp", 4.0),
    LoopEntry("arp_plucked", "Plucked Arp", 100, "D", ["arp", "plucked", "folk"], "arp", 4.0),
    LoopEntry("dk_garage", "UK Garage", 132, "G", ["garage", "beat", "shuffle", "2step"], "drums", 4.0),
    LoopEntry("bs_funk_slap", "Funk Slap Bass", 110, "F", ["funk", "slap", "groovy"], "bass", 4.0),
    LoopEntry("syn_brass_stab", "Brass Stab", 120, "C", ["brass", "stab", "orchestral"], "synth", 2.0),
    LoopEntry("fx_glitch", "Glitch FX", 140, "C", ["glitch", "stutter", "beat_repeat"], "fx", 2.0),
    LoopEntry("pad_drone", "Drone Pad", 60, "G#", ["drone", "dark", "sustained"], "pads", 16.0),
]


class LoopLibrary:
    """Searchable database of loops with metadata and similarity matching."""

    def __init__(self):
        self._loops: dict[str, LoopEntry] = {}

    def add_loop(self, loop: LoopEntry) -> None:
        self._loops[loop.id] = loop

    def remove_loop(self, loop_id: str) -> None:
        self._loops.pop(loop_id, None)

    def get_loop(self, loop_id: str) -> LoopEntry | None:
        return self._loops.get(loop_id)

    def load_builtins(self) -> None:
        """Populate library with all built-in loop definitions."""
        for loop in BUILTIN_LOOPS:
            self.add_loop(loop)

    def all_loops(self) -> list[LoopEntry]:
        return list(self._loops.values())

    def search(
        self,
        query: str = "",
        bpm_min: float = 0,
        bpm_max: float = 999,
        key: str | None = None,
        category: str | None = None,
        tags: list[str] | None = None,
    ) -> list[LoopEntry]:
        """Search loops by text query, BPM range, key, category, and tags.

        Text query matches against name and tags (case-insensitive).
        """
        results = list(self._loops.values())

        if query:
            q = query.lower()
            results = [
                l for l in results
                if q in l.name.lower()
                or any(q in t.lower() for t in l.tags)
            ]

        results = [l for l in results if bpm_min <= l.bpm <= bpm_max]

        if key is not None:
            key_norm = key.capitalize()
            results = [l for l in results if l.key == key_norm]

        if category is not None:
            results = [l for l in results if l.category == category]

        if tags:
            tag_set = set(t.lower() for t in tags)
            results = [
                l for l in results
                if tag_set.intersection(t.lower() for t in l.tags)
            ]

        return results

    def get_by_tag(self, tag: str) -> list[LoopEntry]:
        """Return all loops matching a specific tag."""
        tag_lower = tag.lower()
        return [l for l in self._loops.values() if tag_lower in (t.lower() for t in l.tags)]

    def get_by_bpm(self, bpm: float, tolerance: float = 5.0) -> list[LoopEntry]:
        """Return loops within BPM tolerance of the given tempo."""
        return [l for l in self._loops.values() if abs(l.bpm - bpm) <= tolerance]

    def get_by_key(self, key: str) -> list[LoopEntry]:
        """Return all loops in a given key."""
        key_norm = key.capitalize()
        return [l for l in self._loops.values() if l.key == key_norm]

    def get_by_category(self, category: str) -> list[LoopEntry]:
        """Return all loops in a given category."""
        return [l for l in self._loops.values() if l.category == category]

    def get_similar_loops(self, loop_id: str, n: int = 5) -> list[LoopEntry]:
        """Find similar loops using BPM proximity and shared tag overlap."""
        loop = self.get_loop(loop_id)
        if loop is None:
            return []

        candidates = [l for l in self._loops.values() if l.id != loop_id]
        scored: list[tuple[float, LoopEntry]] = []

        loop_tags_lower = set(t.lower() for t in loop.tags)
        for candidate in candidates:
            tag_overlap = loop_tags_lower.intersection(t.lower() for t in candidate.tags)
            bpm_diff = abs(candidate.bpm - loop.bpm)
            tag_score = len(tag_overlap) * 2.0
            bpm_score = max(0, 10 - bpm_diff / 2)
            category_bonus = 2.0 if candidate.category == loop.category else 0.0
            total = tag_score + bpm_score + category_bonus
            scored.append((total, candidate))

        scored.sort(key=lambda x: -x[0])
        return [entry for _, entry in scored[:n]]

    def scan_directory(self, directory: str | Path, recursive: bool = True) -> list[LoopEntry]:
        """Import loops from a directory by scanning audio files.

        Attempts to read metadata (duration, sample rate) using soundfile/pydub.
        Files are added with their filename as name, BPM/key need manual tagging.
        """
        import soundfile as sf

        directory = Path(directory)
        if not directory.is_dir():
            raise NotADirectoryError(f"Not a directory: {directory}")

        audio_exts = {".wav", ".mp3", ".flac", ".ogg", ".aiff", ".m4a", ".aac"}
        pattern = "**/*" if recursive else "*"
        found: list[LoopEntry] = []

        for fpath in sorted(directory.glob(pattern)):
            if not fpath.is_file() or fpath.suffix.lower() not in audio_exts:
                continue

            try:
                info = sf.info(str(fpath))
                loop_id = fpath.stem.replace(" ", "_").lower()
                entry = LoopEntry(
                    id=loop_id,
                    name=fpath.stem,
                    bpm=120.0,
                    key="C",
                    tags=[fpath.suffix.lstrip(".").lower()],
                    category="drums",
                    duration=info.duration,
                    path=str(fpath),
                )
                self.add_loop(entry)
                found.append(entry)
            except Exception:
                continue

        return found
