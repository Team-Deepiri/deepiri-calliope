"""MIDI import/export for music generation."""

from __future__ import annotations

import struct
import numpy as np
from dataclasses import dataclass
from pathlib import Path


@dataclass
class MIDIEvent:
    time: float
    note: int
    velocity: int
    duration: float
    channel: int = 0


@dataclass
class MIDITrack:
    name: str
    events: list[MIDIEvent]
    instrument: str = "piano"


class MIDIExporter:
    """Export pitch data to MIDI files."""

    def __init__(self, tempo: int = 120):
        self.tempo = tempo
        self.ticks_per_beat = 480

    def note_to_midi(self, note: str) -> int:
        note_map = {
            "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
            "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
            "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
        }
        note_name = note.strip().upper()
        for name, idx in note_map.items():
            if note_name.startswith(name):
                octave = int(note_name[len(name):]) if len(note_name) > len(name) else 4
                return (octave + 1) * 12 + idx
        return 60

    def midi_to_note(self, midi: int) -> str:
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        octave = (midi // 12) - 1
        note = note_names[midi % 12]
        return f"{note}{octave}"

    def frequency_to_midi(self, freq: float) -> int:
        if freq <= 0:
            return 0
        return int(round(69 + 12 * np.log2(freq / 440)))

    def create_note_events(
        self,
        f0_data: list[float],
        confidence: list[float],
        sample_rate: int,
        threshold: float = 0.5,
        min_note_duration: float = 0.05,
    ) -> list[MIDIEvent]:
        events = []
        current_note = None
        note_start = 0.0
        velocities = []

        for i, (freq, conf) in enumerate(zip(f0_data, confidence)):
            if conf < threshold:
                if current_note is not None:
                    duration = (i / sample_rate) - note_start
                    if duration >= min_note_duration:
                        avg_velocity = int(np.mean(velocities) * 127) if velocities else 80
                        events.append(MIDIEvent(
                            time=note_start,
                            note=current_note,
                            velocity=min(127, max(1, avg_velocity)),
                            duration=duration,
                        ))
                    current_note = None
                    velocities = []
                continue

            midi_note = self.frequency_to_midi(freq)

            if current_note is None:
                current_note = midi_note
                note_start = i / sample_rate
                velocities = [conf]
            elif midi_note != current_note:
                duration = (i / sample_rate) - note_start
                if duration >= min_note_duration:
                    avg_velocity = int(np.mean(velocities) * 127) if velocities else 80
                    events.append(MIDIEvent(
                        time=note_start,
                        note=current_note,
                        velocity=min(127, max(1, avg_velocity)),
                        duration=duration,
                    ))
                current_note = midi_note
                note_start = i / sample_rate
                velocities = [conf]
            else:
                velocities.append(conf)

        if current_note is not None:
            duration = (len(f0_data) / sample_rate) - note_start
            if duration >= min_note_duration:
                avg_velocity = int(np.mean(velocities) * 127) if velocities else 80
                events.append(MIDIEvent(
                    time=note_start,
                    note=current_note,
                    velocity=min(127, max(1, avg_velocity)),
                    duration=duration,
                ))

        return events

    def export_to_file(self, events: list[MIDIEvent], file_path: str | Path) -> None:
        with open(file_path, "wb") as f:
            f.write(b"MThd")
            f.write(struct.pack(">H", 6))
            f.write(struct.pack(">H", 0))
            f.write(struct.pack(">H", 1))
            f.write(struct.pack(">H", self.ticks_per_beat))

            f.write(b"MTrk")

            track_data = bytearray()

            for event in events:
                start_tick = int(event.time * self.tempo * self.ticks_per_beat / 60)
                end_tick = start_tick + int(event.duration * self.tempo * self.ticks_per_beat / 60)

                track_data.extend(self._write_var_len(start_tick))
                track_data.extend([0x90 | event.channel, event.note, event.velocity])

                track_data.extend(self._write_var_len(end_tick - start_tick))
                track_data.extend([0x80 | event.channel, event.note, 0])

            track_data.extend([0x00, 0xFF, 0x2F, 0x00])

            f.write(struct.pack(">I", len(track_data)))
            f.write(track_data)

    def _write_var_len(self, value: int) -> bytes:
        result = bytearray()
        while value >= 0x80:
            result.append((value & 0x7F) | 0x80)
            value >>= 7
        result.append(value & 0x7F)
        return bytes(result)

    def export_melody_to_midi(
        self,
        samples: np.ndarray,
        sr: int,
        output_path: str | Path,
        threshold: float = 0.5,
    ) -> dict:
        """Export audio melody to MIDI file."""
        from calliope.tune.gravy_autotune import detect_pitch_crepe

        f0_data, confidence = detect_pitch_crepe(samples, sr)
        events = self.create_note_events(f0_data, confidence, sr, threshold)

        self.export_to_file(events, output_path)

        return {
            "output_file": str(output_path),
            "note_count": len(events),
            "duration_sec": max((e.time + e.duration) for e in events) if events else 0,
            "notes": [self.midi_to_note(e.note) for e in events],
        }


class MIDIImporter:
    """Import MIDI files for processing."""

    def __init__(self):
        self.ticks_per_beat = 480

    def parse_track(self, data: bytes, tempo: int = 120) -> list[MIDIEvent]:
        events = []
        pos = 0
        current_time = 0.0
        current_note = None

        while pos < len(data):
            delta = 0
            while pos < len(data):
                byte = data[pos]
                pos += 1
                delta = (delta << 7) | (byte & 0x7F)
                if not (byte & 0x80):
                    break

            current_time += delta * 60.0 / (self.ticks_per_beat * tempo)

            if pos >= len(data):
                break

            status = data[pos]
            pos += 1

            if status == 0xFF:
                if pos < len(data):
                    meta_type = data[pos]
                    pos += 1
                    if meta_type == 0x51:
                        if pos + 3 <= len(data):
                            tempo = struct.unpack(">I", b"\x00" + data[pos:pos+3])[0]
                            pos += 3
                    else:
                        length = data[pos]
                        pos += 1
                        pos += length
                continue

            if (status & 0xF0) == 0x80:
                note = data[pos] if pos < len(data) else 0
                velocity = data[pos + 1] if pos + 1 < len(data) else 0
                pos += 2
                if current_note:
                    events.append(MIDIEvent(
                        time=current_time,
                        note=current_note[0],
                        velocity=current_note[1],
                        duration=current_time - current_note[2],
                    ))
                    current_note = None

            elif (status & 0xF0) == 0x90:
                note = data[pos] if pos < len(data) else 0
                velocity = data[pos + 1] if pos + 1 < len(data) else 0
                pos += 2
                if velocity > 0:
                    current_note = (note, velocity, current_time)
                else:
                    if current_note:
                        events.append(MIDIEvent(
                            time=current_time,
                            note=current_note[0],
                            velocity=current_note[1],
                            duration=current_time - current_note[2],
                        ))
                        current_note = None

            elif (status & 0xF0) == 0xA0:
                pos += 2
            elif (status & 0xF0) == 0xB0:
                pos += 2
            elif (status & 0xF0) == 0xE0:
                pos += 2
            elif (status & 0xF0) == 0xC0:
                pos += 1
            elif (status & 0xF0) == 0xD0:
                pos += 1

        if current_note:
            events.append(MIDIEvent(
                time=current_time,
                note=current_note[0],
                velocity=current_note[1],
                duration=0,
            ))

        return events

    def import_from_file(self, file_path: str | Path) -> dict:
        """Import MIDI file and return track information."""
        with open(file_path, "rb") as f:
            data = f.read()

        if data[:4] != b"MThd":
            return {"error": "Invalid MIDI file"}

        header = struct.unpack(">HHH", data[4:10])
        format_type, num_tracks, ticks_per_beat = header

        tracks = []
        pos = 10

        for _ in range(num_tracks):
            if data[pos:pos+4] != b"MTrk":
                break
            pos += 4

            track_size = struct.unpack(">I", data[pos:pos+4])[0]
            pos += 4

            track_data = data[pos:pos+track_size]
            events = self.parse_track(track_data)
            tracks.append({
                "events": events,
                "note_count": len(events),
            })
            pos += track_size

        return {
            "format": format_type,
            "tracks": len(tracks),
            "ticks_per_beat": ticks_per_beat,
            "track_data": tracks,
        }


def audio_to_midi(
    samples: np.ndarray,
    sr: int,
    output_path: str,
    threshold: float = 0.5,
) -> dict:
    """Convert audio melody to MIDI file."""
    exporter = MIDIExporter()
    return exporter.export_melody_to_midi(samples, sr, output_path, threshold)


def midi_to_events(file_path: str) -> list[MIDIEvent]:
    """Read MIDI file and return note events."""
    importer = MIDIImporter()
    result = importer.import_from_file(file_path)
    if "error" in result:
        return []
    return result["track_data"][0]["events"] if result.get("track_data") else []