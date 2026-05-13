"""Sound design synthesizer API routes."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from calliope.audio.synthesizer import SoundDesigner, generate_synth_note, generate_sequence, Synthesizer, SynthConfig
from calliope.audio.io import write_audio_file
from calliope.config import get_settings

router = APIRouter(prefix="/v1/synth", tags=["synth"])


class NoteRequest(BaseModel):
    preset: str
    midi_note: int
    duration: float
    velocity: float = 1.0


class SequenceRequest(BaseModel):
    preset: str
    notes: list[tuple[int, float, float]]


@router.get("/presets")
async def list_synth_presets() -> dict:
    """
    List all available synthesizer presets.
    """
    presets = SoundDesigner.list_presets()
    return {"presets": presets}


@router.get("/presets/{preset_name}")
async def get_synth_preset(preset_name: str) -> dict:
    """
    Get details for a specific synthesizer preset.
    """
    preset = SoundDesigner.get_preset(preset_name)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    return {
        "name": preset.name,
        "oscillators": [
            {
                "waveform": osc.waveform,
                "frequency": osc.frequency,
                "detune_cents": osc.detune_cents,
                "amplitude": osc.amplitude,
            }
            for osc in preset.oscillators
        ],
        "envelope": {
            "attack": preset.envelope.attack,
            "decay": preset.envelope.decay,
            "sustain": preset.envelope.sustain,
            "release": preset.envelope.release,
        },
        "filter": {
            "type": preset.filter.filter_type,
            "cutoff": preset.filter.cutoff_freq,
            "resonance": preset.filter.resonance,
        },
        "lfos": [
            {
                "waveform": lfo.waveform,
                "frequency": lfo.frequency,
                "depth": lfo.depth,
                "target": lfo.target,
            }
            for lfo in preset.lfos
        ],
    }


@router.post("/generate/note")
async def generate_note(req: NoteRequest) -> dict:
    """
    Generate a single synth note.
    """
    settings = get_settings()

    samples = generate_synth_note(
        preset_name=req.preset,
        midi_note=req.midi_note,
        duration=req.duration,
        velocity=req.velocity,
    )

    output_path = settings.data_path / "synth" / f"{req.preset}_{req.midi_note}.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_audio_file(output_path, samples, 48000, format="wav")

    from calliope.audio.synthesizer import OscillatorConfig

    preset = SoundDesigner.get_preset(req.preset)
    frequency = 440 * (2 ** ((req.midi_note - 69) / 12))

    return {
        "preset": req.preset,
        "midi_note": req.midi_note,
        "frequency_hz": frequency,
        "duration_sec": req.duration,
        "output_file": str(output_path),
    }


@router.post("/generate/sequence")
async def generate_sequence_route(req: SequenceRequest) -> dict:
    """
    Generate a sequence of synth notes.
    """
    settings = get_settings()

    samples = generate_sequence(
        preset_name=req.preset,
        notes=req.notes,
    )

    output_path = settings.data_path / "synth" / f"{req.preset}_sequence.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_audio_file(output_path, samples, 48000, format="wav")

    return {
        "preset": req.preset,
        "note_count": len(req.notes),
        "output_file": str(output_path),
        "duration_sec": len(samples) / 48000,
    }


@router.post("/generate/chord")
async def generate_chord(
    preset: str,
    root_note: int,
    chord_type: str = "major",
    duration: float = 1.0,
    strum: float = 0.05,
) -> dict:
    """
    Generate a chord from a preset.
    """
    settings = get_settings()

    chord_intervals = {
        "major": [0, 4, 7],
        "minor": [0, 3, 7],
        "diminished": [0, 3, 6],
        "augmented": [0, 4, 8],
        "major7": [0, 4, 7, 11],
        "minor7": [0, 3, 7, 10],
        "dominant7": [0, 4, 7, 10],
        "sus4": [0, 5, 7],
        "sus2": [0, 2, 7],
        "power": [0, 7],
    }

    intervals = chord_intervals.get(chord_type, [0, 4, 7])
    notes = [root_note + interval for interval in intervals]

    output = None
    for i, note in enumerate(notes):
        start_time = i * strum
        note_samples = generate_synth_note(preset, note, duration)

        if output is None:
            output = np.zeros(int((start_time + duration) * 48000) + len(note_samples))
        else:
            if len(output) < int((start_time + duration) * 48000) + len(note_samples):
                output = np.pad(output, (0, int((start_time + duration) * 48000) + len(note_samples) - len(output)))

        start_sample = int(start_time * 48000)
        end_sample = start_sample + len(note_samples)
        output[start_sample:end_sample] += note_samples[:len(output) - start_sample]

    if output is not None:
        peak = np.max(np.abs(output))
        if peak > 1.0:
            output = output / peak * 0.95

    output_path = settings.data_path / "synth" / f"{preset}_{chord_type}_{root_note}.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_audio_file(output_path, output, 48000, format="wav")

    return {
        "preset": preset,
        "root_note": root_note,
        "chord_type": chord_type,
        "notes": notes,
        "output_file": str(output_path),
    }


@router.get("/scales")
async def get_synth_scales() -> dict:
    """
    Get available musical scales for synthesis.
    """
    scales = {
        "major": [0, 2, 4, 5, 7, 9, 11],
        "minor": [0, 2, 3, 5, 7, 8, 10],
        "dorian": [0, 2, 3, 5, 7, 9, 10],
        "phrygian": [0, 1, 3, 5, 7, 8, 10],
        "lydian": [0, 2, 4, 6, 7, 9, 11],
        "mixolydian": [0, 2, 4, 5, 7, 9, 10],
        "locrian": [0, 1, 3, 5, 6, 8, 10],
        "pentatonic_major": [0, 2, 4, 7, 9],
        "pentatonic_minor": [0, 3, 5, 7, 10],
        "blues": [0, 3, 5, 6, 7, 10],
        "chromatic": list(range(12)),
        "whole_tone": [0, 2, 4, 6, 8, 10],
    }

    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    scale_notes = {}
    for scale_name, intervals in scales.items():
        scale_notes[scale_name] = [
            f"{note_names[(root + interval) % 12]}{root // 12 - 1}"
            for root in [60, 72, 84]
        ]

    return {
        "scales": list(scales.keys()),
        "intervals": scales,
        "example_notes": scale_notes,
    }