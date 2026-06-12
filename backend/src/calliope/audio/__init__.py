"""Audio features: STFT, MFCC, loudness, onsets, MIDI representations, generation models, DSP."""

from calliope.audio.chroma import chroma_mean_from_mag
from calliope.audio.loudness import weighted_rms_db
from calliope.audio.mfcc import mfcc_mean
from calliope.audio.onset_peaks import onset_peak_indices
from calliope.audio.onsets import spectral_flux_series
from calliope.audio.peak import true_peak_estimate
from calliope.audio.rms import frame_rms_db, integrated_rms_db
from calliope.audio.stft import stft_magnitude

from calliope.audio.midi_representations import NoteToken, REMIEncoder, MuMIDIEncoder, OctupleMIDIEncoder, CPEncoder
from calliope.audio.music_transformer import MusicTransformerModel, TransformerConfig
from calliope.audio.music_vae import MusicVAE, VAEConfig
from calliope.audio.musegan import MuseGAN, MuseGANConfig
from calliope.audio.pop_mag import PopMAGModel, PopMAGConfig
from calliope.audio.melons import MelonsGenerator, MelonsConfig
from calliope.audio.ddsp_synth import DDSP, DDSPConfig
from calliope.audio.wavenet_audio import WaveNet, WaveNetConfig
from calliope.audio.style_transfer import StyleTransfer, StyleTransferConfig
from calliope.audio.rl_composer import RLComposer, RLComposerConfig
from calliope.audio.parametric_eq import ParametricEQ
from calliope.audio.spectral_editor import SpectralEditor
from calliope.audio.audio_formats import AudioFormatConverter, SUPPORTED_FORMATS
from calliope.audio.loop_library import LoopLibrary
from calliope.audio.pitch_processor import PitchProcessor

__all__ = [
    "chroma_mean_from_mag",
    "integrated_rms_db",
    "weighted_rms_db",
    "mfcc_mean",
    "onset_peak_indices",
    "spectral_flux_series",
    "true_peak_estimate",
    "frame_rms_db",
    "stft_magnitude",
    "NoteToken",
    "REMIEncoder",
    "MuMIDIEncoder",
    "OctupleMIDIEncoder",
    "CPEncoder",
    "MusicTransformerModel",
    "TransformerConfig",
    "MusicVAE",
    "VAEConfig",
    "MuseGAN",
    "MuseGANConfig",
    "PopMAGModel",
    "PopMAGConfig",
    "MelonsGenerator",
    "MelonsConfig",
    "DDSP",
    "DDSPConfig",
    "WaveNet",
    "WaveNetConfig",
    "StyleTransfer",
    "StyleTransferConfig",
    "RLComposer",
    "RLComposerConfig",
    "ParametricEQ",
    "SpectralEditor",
    "AudioFormatConverter",
    "SUPPORTED_FORMATS",
    "LoopLibrary",
    "PitchProcessor",
]
