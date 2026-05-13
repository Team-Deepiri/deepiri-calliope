"""Audio export presets for different platforms and use cases."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal
import numpy as np


class ExportPreset(str, Enum):
    SPOTIFY = "spotify"
    YOUTUBE = "youtube"
    APPLE_MUSIC = "apple_music"
    SOUNDCLOUD = "soundcloud"
    CD_MASTER = "cd_master"
    ARCHIVE = "archive"
    PODCAST = "podcast"
    VOICE_MESSAGE = "voice_message"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"


@dataclass
class AudioExportConfig:
    format: Literal["wav", "mp3", "ogg", "flac", "aac", "m4a"]
    sample_rate: int
    bit_depth: int
    channels: int
    bitrate: int | None = None
    loudness_target: float | None = None
    peak_ceiling: float | None = None
    dither: bool = False
    normalize: bool = True


class ExportPresetManager:
    """Manage audio export configurations for different platforms."""

    PRESETS = {
        ExportPreset.SPOTIFY: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=320000,
            loudness_target=-14.0,
            peak_ceiling=-1.0,
        ),
        ExportPreset.YOUTUBE: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=320000,
            loudness_target=-14.0,
            peak_ceiling=-1.0,
            normalize=True,
        ),
        ExportPreset.APPLE_MUSIC: AudioExportConfig(
            format="aac",
            sample_rate=48000,
            bit_depth=16,
            channels=2,
            bitrate=256000,
            loudness_target=-16.0,
            peak_ceiling=-1.0,
        ),
        ExportPreset.SOUNDCLOUD: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=320000,
            loudness_target=-14.0,
            peak_ceiling=-0.5,
        ),
        ExportPreset.CD_MASTER: AudioExportConfig(
            format="wav",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=None,
            loudness_target=None,
            peak_ceiling=-0.1,
            dither=True,
            normalize=False,
        ),
        ExportPreset.ARCHIVE: AudioExportConfig(
            format="flac",
            sample_rate=48000,
            bit_depth=24,
            channels=2,
            bitrate=None,
            loudness_target=None,
            peak_ceiling=-0.5,
            normalize=False,
        ),
        ExportPreset.PODCAST: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=128000,
            loudness_target=-16.0,
            peak_ceiling=-1.0,
        ),
        ExportPreset.VOICE_MESSAGE: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=1,
            bitrate=128000,
            loudness_target=-18.0,
            peak_ceiling=-1.0,
        ),
        ExportPreset.INSTAGRAM: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=192000,
            loudness_target=-14.0,
            peak_ceiling=-1.0,
        ),
        ExportPreset.TIKTOK: AudioExportConfig(
            format="mp3",
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            bitrate=192000,
            loudness_target=-14.0,
            peak_ceiling=-1.0,
        ),
    }

    @classmethod
    def get_preset(cls, preset_type: ExportPreset) -> AudioExportConfig:
        return cls.PRESETS.get(preset_type, cls.PRESETS[ExportPreset.SPOTIFY])

    @classmethod
    def list_presets(cls) -> list[dict]:
        return [
            {
                "type": preset.value,
                "format": config.format,
                "sample_rate": config.sample_rate,
                "bit_depth": config.bit_depth,
                "channels": config.channels,
                "bitrate": config.bitrate,
                "loudness_target": config.loudness_target,
            }
            for preset, config in cls.PRESETS.items()
        ]

    @classmethod
    def apply_preset(
        cls,
        samples: np.ndarray,
        sr: int,
        preset_type: ExportPreset,
    ) -> np.ndarray:
        """Apply export preset processing to audio."""
        config = cls.get_preset(preset_type)

        processed = samples.copy()

        if sr != config.sample_rate:
            from scipy.signal import resample_poly

            ratio = config.sample_rate / sr
            new_len = int(len(processed) * ratio)
            processed = resample_poly(processed, int(ratio * 1000), 1000)[:new_len]

        if config.normalize and config.loudness_target is not None:
            from calliope.audio.loudness import loudness_normalize

            processed = loudness_normalize(processed, config.loudness_target)

        if config.peak_ceiling is not None:
            peak_db = config.peak_ceiling
            peak_linear = 10 ** (peak_db / 20)
            current_peak = np.max(np.abs(processed))
            if current_peak > peak_linear:
                processed = processed * (peak_linear / current_peak)

        if config.dither and config.bit_depth < 24:
            noise = np.random.randn(*processed.shape) * (10 ** (-config.bit_depth / 6))
            processed = processed + noise

        return processed


def export_with_preset(
    samples: np.ndarray,
    sr: int,
    output_path: str,
    preset_type: str,
) -> dict:
    """
    Export audio with a platform preset.
    """
    from calliope.audio.io import write_audio_file
    from pathlib import Path

    try:
        preset = ExportPreset(preset_type)
    except ValueError:
        preset = ExportPreset.SPOTIFY

    config = ExportPresetManager.get_preset(preset)
    processed = ExportPresetManager.apply_preset(samples, sr, preset)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    write_audio_file(output, processed, config.sample_rate, format=config.format)

    return {
        "output_file": str(output),
        "preset": preset.value,
        "format": config.format,
        "sample_rate": config.sample_rate,
        "bit_depth": config.bit_depth,
        "channels": config.channels,
        "duration_sec": len(processed) / config.sample_rate,
    }