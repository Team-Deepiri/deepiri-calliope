"""MIDI import/export API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pathlib import Path

from calliope.audio.midi_export import MIDIExporter, MIDIImporter, audio_to_midi, midi_to_events
from calliope.audio.io import read_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/midi", tags=["midi"])


@router.post("/export/audio")
async def export_audio_to_midi(
    recording_id: str,
    session_id: str | None = None,
    threshold: float = 0.5,
    output_format: str = "midi",
) -> dict:
    """
    Convert audio recording melody to MIDI file.
    """
    settings = get_settings()

    samples = None
    sr = 48000

    if session_id:
        from calliope.routes.recordings import _recordings

        if session_id in _recordings:
            session = _recordings[session_id]
            recording = next((f for f in session["files"] if f["id"] == recording_id), None)

            if recording:
                file_path = Path(recording["path"])
                if file_path.exists():
                    samples, sr = read_audio_file(file_path)

    if samples is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    output_dir = settings.data_path / "midi"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{recording_id}.mid"

    result = audio_to_midi(samples, sr, output_path, threshold)

    return {
        "recording_id": recording_id,
        "midi_file": str(output_path),
        "note_count": result["note_count"],
        "duration_sec": result["duration_sec"],
        "notes": result["notes"],
    }


@router.get("/export/f0")
async def export_f0_to_midi(
    f0_data: list[float],
    confidence: list[float],
    sample_rate: int = 48000,
    tempo: int = 120,
    threshold: float = 0.5,
) -> dict:
    """
    Convert pitch data directly to MIDI.
    """
    settings = get_settings()

    exporter = MIDIExporter(tempo=tempo)
    events = exporter.create_note_events(f0_data, confidence, sample_rate, threshold)

    output_path = settings.data_path / "midi" / f"f0_export_{tempo}bpm.mid"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    exporter.export_to_file(events, output_path)

    return {
        "midi_file": str(output_path),
        "note_count": len(events),
        "tempo": tempo,
        "notes": [exporter.midi_to_note(e.note) for e in events],
    }


@router.post("/import")
async def import_midi_file(
    file_id: str | None = None,
    file_path: str | None = None,
) -> dict:
    """
    Import a MIDI file and return track data.
    """
    importer = MIDIImporter()

    if file_id:
        from calliope.routes.recordings import _recordings

        for session in _recordings.values():
            recording = next((f for f in session["files"] if f["id"] == file_id), None)
            if recording:
                file_path = recording["path"]
                break

    if not file_path:
        raise HTTPException(status_code=400, detail="No file specified")

    result = importer.import_from_file(file_path)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/convert/to-audio")
async def convert_midi_to_note_sequence(
    midi_data: list[dict],
    sample_rate: int = 48000,
    duration_per_note: float = 0.5,
) -> dict:
    """
    Convert MIDI note data to audio synthesis parameters.
    """
    import numpy as np

    notes = []
    for note_data in midi_data:
        note = note_data.get("note", 60)
        velocity = note_data.get("velocity", 100)
        duration = note_data.get("duration", duration_per_note)

        freq = 440 * (2 ** ((note - 69) / 12))

        notes.append({
            "frequency": float(freq),
            "midi_note": note,
            "velocity": velocity,
            "duration_sec": duration,
            "note_name": chr(65 + (note % 12)) + str(note // 12 - 1),
        })

    total_duration = sum(n["duration_sec"] for n in notes)

    return {
        "notes": notes,
        "total_duration_sec": total_duration,
        "note_count": len(notes),
    }


@router.post("/batch/export")
async def batch_export_to_midi(
    recordings: list[dict],
    threshold: float = 0.5,
) -> dict:
    """
    Export multiple recordings to MIDI files.
    """
    settings = get_settings()
    results = []

    for rec in recordings:
        recording_id = rec.get("recording_id")
        session_id = rec.get("session_id")

        samples = None
        sr = 48000

        if session_id:
            from calliope.routes.recordings import _recordings

            if session_id in _recordings:
                session = _recordings[session_id]
                recording = next((f for f in session["files"] if f["id"] == recording_id), None)

                if recording:
                    file_path = Path(recording["path"])
                    if file_path.exists():
                        samples, sr = read_audio_file(file_path)

        if samples is not None:
            try:
                output_path = settings.data_path / "midi" / f"{recording_id}.mid"
                output_path.parent.mkdir(parents=True, exist_ok=True)

                result = audio_to_midi(samples, sr, output_path, threshold)
                results.append({
                    "recording_id": recording_id,
                    "status": "success",
                    "midi_file": str(output_path),
                    "note_count": result["note_count"],
                })
            except Exception as e:
                results.append({
                    "recording_id": recording_id,
                    "status": "failed",
                    "error": str(e),
                })
        else:
            results.append({
                "recording_id": recording_id,
                "status": "failed",
                "error": "Recording not found",
            })

    return {
        "total": len(recordings),
        "results": results,
    }