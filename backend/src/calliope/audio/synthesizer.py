"""Sound design synthesizer engine with multiple oscillator types."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class OscillatorConfig:
    waveform: Literal["sine", "square", "sawtooth", "triangle", "noise", "fm"]
    frequency: float = 440.0
    detune_cents: float = 0.0
    amplitude: float = 1.0
    phase_offset: float = 0.0


@dataclass
class EnvelopeConfig:
    attack: float = 0.01
    decay: float = 0.1
    sustain: float = 0.7
    release: float = 0.3


@dataclass
class FilterConfig:
    filter_type: Literal["lowpass", "highpass", "bandpass", "notch"] = "lowpass"
    cutoff_freq: float = 1000.0
    resonance: float = 0.5
    envelope_amount: float = 0.0


@dataclass
class LFOConfig:
    waveform: Literal["sine", "square", "sawtooth", "triangle"] = "sine"
    frequency: float = 1.0
    depth: float = 0.5
    target: str = "pitch"


@dataclass
class SynthConfig:
    name: str
    oscillators: list[OscillatorConfig] = field(default_factory=list)
    envelope: EnvelopeConfig = field(default_factory=EnvelopeConfig)
    filter: FilterConfig = field(default_factory=FilterConfig)
    lfos: list[LFOConfig] = field(default_factory=list)
    polyphony: int = 8
    glide: float = 0.0


class Oscillator:
    """Base oscillator with multiple waveform types."""

    def __init__(self, config: OscillatorConfig, sr: int = 48000):
        self.config = config
        self.sr = sr
        self.phase = config.phase_offset

    def generate(self, duration_sec: float, frequency: float | None = None) -> np.ndarray:
        freq = frequency or self.config.frequency
        freq = freq * (2 ** (self.config.detune_cents / 1200))
        
        n_samples = int(duration_sec * self.sr)
        t = np.arange(n_samples) / self.sr
        
        waveform = self.config.waveform
        
        if waveform == "sine":
            samples = np.sin(2 * np.pi * freq * t + self.phase)
        elif waveform == "square":
            samples = np.sign(np.sin(2 * np.pi * freq * t + self.phase))
        elif waveform == "sawtooth":
            samples = 2 * ((freq * t + self.phase / (2 * np.pi)) % 1) - 1
        elif waveform == "triangle":
            samples = 2 * np.abs(2 * ((freq * t + self.phase / (2 * np.pi)) % 1) - 1) - 1
        elif waveform == "noise":
            samples = np.random.randn(n_samples) * np.sqrt(2)
        elif waveform == "fm":
            carrier = np.sin(2 * np.pi * freq * t)
            modulator = np.sin(2 * np.pi * (freq * 2) * t)
            samples = np.sin(2 * np.pi * freq * t + 5 * modulator)
        else:
            samples = np.sin(2 * np.pi * freq * t + self.phase)

        self.phase = (freq * duration_sec + self.phase / (2 * np.pi)) % 1 * 2 * np.pi

        return samples * self.config.amplitude

    def reset(self) -> None:
        self.phase = self.config.phase_offset


class Envelope:
    """ADSR envelope generator."""

    def __init__(self, config: EnvelopeConfig, sr: int = 48000):
        self.config = config
        self.sr = sr
        self.stage = "idle"
        self.value = 0.0
        self.samples_since_start = 0

    def generate(self, note_on_samples: int, note_off_sample: int | None = None) -> np.ndarray:
        total_samples = note_on_samples + (note_off_sample or note_on_samples)
        output = np.zeros(total_samples)

        attack_samples = int(self.config.attack * self.sr)
        decay_samples = int(self.config.decay * self.sr)
        release_samples = int(self.config.release * self.sr) if note_off_sample else 0

        attack_end = min(attack_samples, total_samples)
        for i in range(attack_end):
            output[i] = min(1.0, i / max(1, attack_samples - 1))

        decay_end = min(attack_end + decay_samples, total_samples)
        decay_start = attack_end
        decay_duration = decay_end - decay_start
        for i in range(decay_duration):
            t = i / max(1, decay_samples - 1)
            output[decay_start + i] = self.config.sustain + (1 - self.config.sustain) * (1 - t)

        if note_off_sample:
            note_off = note_off_sample - note_on_samples
            release_end = min(note_off + release_samples, total_samples)
            for i in range(note_off, release_end):
                t = (i - note_off) / max(1, release_samples - 1)
                output[i] = output[note_off - 1] * (1 - t)
            for i in range(release_end, total_samples):
                output[i] = 0

        return output

    def reset(self) -> None:
        self.stage = "idle"
        self.value = 0.0
        self.samples_since_start = 0


class Synthesizer:
    """Polyphonic synthesizer with oscillators, filters, and LFOs."""

    def __init__(self, config: SynthConfig, sr: int = 48000):
        self.config = config
        self.sr = sr
        
        self.oscillators = [Oscillator(osc, sr) for osc in config.oscillators]
        self.envelope = Envelope(config.envelope, sr)
        self.filter_config = config.filter
        
        self.voices = {}
        self.voice_index = 0

        self.lfos = []
        for lfo_config in config.lfos:
            self.lfos.append({
                "config": lfo_config,
                "phase": 0.0,
            })

    def note_on(self, midi_note: int, velocity: float = 1.0) -> None:
        frequency = 440 * (2 ** ((midi_note - 69) / 12))
        
        voice_id = self.voice_index % self.config.polyphony
        self.voice_index += 1
        
        self.voices[voice_id] = {
            "frequency": frequency,
            "velocity": velocity,
            "start_sample": 0,
            "active": True,
        }
        
        for osc in self.oscillators:
            osc.reset()

    def note_off(self, midi_note: int) -> None:
        frequency = 440 * (2 ** ((midi_note - 69) / 12))
        
        for voice_id, voice in self.voices.items():
            if voice["active"] and abs(voice["frequency"] - frequency) < 1.0:
                voice["end_sample"] = 0

    def generate(self, duration_sec: float) -> np.ndarray:
        """Generate audio for all active voices for the given duration."""
        n_samples = int(duration_sec * self.sr)
        output = np.zeros(n_samples)

        for osc in self.oscillators:
            for voice_id, voice in self.voices.items():
                if voice.get("active", True):
                    freq = voice["frequency"]
                    
                    # Apply LFO modulation
                    for lfo in self.lfos:
                        lfo_config = lfo["config"]
                        if lfo_config.target == "pitch":
                            lfo_phase = lfo["phase"]
                            lfo_waveform = {
                                "sine": np.sin,
                                "square": lambda x: np.sign(np.sin(x)),
                                "sawtooth": lambda x: 2 * ((x / (2 * np.pi)) % 1) - 1,
                                "triangle": lambda x: 2 * np.abs(2 * ((x / (2 * np.pi)) % 1) - 1) - 1,
                            }.get(lfo_config.waveform, np.sin)
                            
                            lfo_mod = lfo_waveform(lfo_phase) * lfo_config.depth * 50
                            freq = freq * (2 ** (lfo_mod / 1200))
                            
                            lfo["phase"] += 2 * np.pi * lfo_config.frequency / self.sr
                            if lfo["phase"] > 2 * np.pi:
                                lfo["phase"] -= 2 * np.pi
                    
                    # Generate samples for this voice
                    samples = osc.generate(duration_sec, freq)
                    # Simple envelope for now, full ADSR integration pending
                    output += samples * voice["velocity"]

        # Apply global filter
        output = self.process_samples(output)
        
        return output

    def process_samples(self, samples: np.ndarray) -> np.ndarray:
        from scipy.signal import butter, lfilter

        nyq = self.sr / 2
        cutoff_normalized = min(self.filter_config.cutoff_freq / nyq, 0.99)
        
        b, a = butter(4, cutoff_normalized, btype=self.filter_config.filter_type)

        filtered = lfilter(b, a, samples)

        if self.filter_config.resonance > 0:
            q = 1 / (self.filter_config.resonance + 0.1)
            b_res, a_res = butter(2, cutoff_normalized, btype="bandpass")
            resonance = lfilter(b_res, a_res, samples) * self.filter_config.resonance * q
            filtered = filtered + resonance

        return filtered

    def reset(self) -> None:
        self.voices.clear()
        for osc in self.oscillators:
            osc.reset()
        self.envelope.reset()


class SoundDesigner:
    """Create and manage sound presets."""

    PRESETS = {
        "bass_sub": SynthConfig(
            name="Sub Bass",
            oscillators=[
                OscillatorConfig(waveform="sine", frequency=55, amplitude=1.0),
                OscillatorConfig(waveform="sine", frequency=110, amplitude=0.3),
            ],
            envelope=EnvelopeConfig(attack=0.01, decay=0.2, sustain=0.8, release=0.3),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=200, resonance=0.3),
        ),
        "lead_synth": SynthConfig(
            name="Synth Lead",
            oscillators=[
                OscillatorConfig(waveform="sawtooth", frequency=440, detune_cents=5),
                OscillatorConfig(waveform="square", frequency=440, detune_cents=-5, amplitude=0.5),
            ],
            envelope=EnvelopeConfig(attack=0.01, decay=0.1, sustain=0.7, release=0.2),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=2000, resonance=0.6),
            lfos=[LFOConfig(waveform="sine", frequency=0.5, depth=0.02, target="filter")],
        ),
        "pad_warm": SynthConfig(
            name="Warm Pad",
            oscillators=[
                OscillatorConfig(waveform="sawtooth", frequency=220, detune_cents=10),
                OscillatorConfig(waveform="triangle", frequency=220, detune_cents=-10, amplitude=0.7),
            ],
            envelope=EnvelopeConfig(attack=0.5, decay=0.3, sustain=0.8, release=1.0),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=1500, resonance=0.4),
        ),
        "pluck_electric": SynthConfig(
            name="Electric Pluck",
            oscillators=[
                OscillatorConfig(waveform="square", frequency=440, amplitude=0.8),
                OscillatorConfig(waveform="sine", frequency=880, amplitude=0.2),
            ],
            envelope=EnvelopeConfig(attack=0.001, decay=0.3, sustain=0.0, release=0.3),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=3000, resonance=0.5),
        ),
        "fx_rise": SynthConfig(
            name="Rise FX",
            oscillators=[
                OscillatorConfig(waveform="sawtooth", frequency=100, amplitude=1.0),
                OscillatorConfig(waveform="noise", frequency=100, amplitude=0.3),
            ],
            envelope=EnvelopeConfig(attack=0.01, decay=0.5, sustain=1.0, release=1.0),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=500, resonance=0.7, envelope_amount=0.8),
            lfos=[LFOConfig(waveform="sine", frequency=0.2, depth=0.5, target="filter")],
        ),
        "keys_upright": SynthConfig(
            name="Upright Keys",
            oscillators=[
                OscillatorConfig(waveform="triangle", frequency=440, amplitude=1.0),
            ],
            envelope=EnvelopeConfig(attack=0.005, decay=0.2, sustain=0.5, release=0.4),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=2500, resonance=0.3),
        ),
        "reese_bass": SynthConfig(
            name="Reese Bass",
            oscillators=[
                OscillatorConfig(waveform="sawtooth", frequency=55, detune_cents=7),
                OscillatorConfig(waveform="sawtooth", frequency=55, detune_cents=-7),
            ],
            envelope=EnvelopeConfig(attack=0.05, decay=0.2, sustain=0.9, release=0.5),
            filter=FilterConfig(filter_type="lowpass", cutoff_freq=400, resonance=0.5),
        ),
        "vocal_chop": SynthConfig(
            name="Vocal Chop",
            oscillators=[
                OscillatorConfig(waveform="fm", frequency=440, amplitude=0.8),
                OscillatorConfig(waveform="sine", frequency=880, amplitude=0.3),
            ],
            envelope=EnvelopeConfig(attack=0.01, decay=0.1, sustain=0.6, release=0.2),
            filter=FilterConfig(filter_type="bandpass", cutoff_freq=1000, resonance=0.6),
        ),
    }

    @classmethod
    def get_preset(cls, name: str) -> SynthConfig | None:
        return cls.PRESETS.get(name)

    @classmethod
    def list_presets(cls) -> list[dict]:
        return [
            {"name": preset.name, "oscillators": len(preset.oscillators), "filter": preset.filter.filter_type.value}
            for preset in cls.PRESETS.values()
        ]


def generate_synth_note(
    preset_name: str,
    midi_note: int,
    duration: float,
    velocity: float = 1.0,
    sr: int = 48000,
) -> np.ndarray:
    """Generate a synth note from a preset."""
    preset = SoundDesigner.get_preset(preset_name)
    if not preset:
        return np.zeros(int(sr * duration))

    synth = Synthesizer(preset, sr)
    synth.note_on(midi_note, velocity)
    
    samples = synth.generate(duration)
    samples = synth.process_samples(samples)
    
    synth.note_off(midi_note)
    release_samples = int(preset.envelope.release * sr)
    release = np.exp(-np.arange(release_samples) / (release_samples / 10))
    
    if len(release) <= len(samples):
        samples[-len(release):] *= release
    else:
        samples = samples * release[:len(samples)]

    return samples


def generate_sequence(
    preset_name: str,
    notes: list[tuple[int, float, float]],
    sr: int = 48000,
) -> np.ndarray:
    """Generate a sequence of notes."""
    total_duration = max(end for _, _, end in notes) + 1.0
    output = np.zeros(int(total_duration * sr))
    
    for midi_note, start, duration in notes:
        samples = generate_synth_note(preset_name, midi_note, duration, sr=sr)
        start_sample = int(start * sr)
        end_sample = start_sample + len(samples)
        
        if end_sample <= len(output):
            output[start_sample:end_sample] += samples
        else:
            output[start_sample:] += samples[:len(output) - start_sample]
    
    peak = np.max(np.abs(output))
    if peak > 1.0:
        output = output / peak * 0.95
    
    return output