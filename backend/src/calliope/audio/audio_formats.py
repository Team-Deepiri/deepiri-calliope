"""Audio format support registry with conversion and metadata extraction."""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

SUPPORTED_FORMATS: dict[str, dict[str, Any]] = {
    "wav": {"description": "Waveform Audio", "mime": "audio/wav", "codec": "pcm_s16le", "lossless": True},
    "mp3": {"description": "MPEG Layer 3", "mime": "audio/mpeg", "codec": "libmp3lame", "lossless": False},
    "flac": {"description": "Free Lossless Audio Codec", "mime": "audio/flac", "codec": "flac", "lossless": True},
    "ogg": {"description": "Ogg Vorbis", "mime": "audio/ogg", "codec": "libvorbis", "lossless": False},
    "aiff": {"description": "Audio Interchange File Format", "mime": "audio/aiff", "codec": "pcm_s16be", "lossless": True},
    "m4a": {"description": "MPEG-4 Audio", "mime": "audio/mp4", "codec": "aac", "lossless": False},
    "wma": {"description": "Windows Media Audio", "mime": "audio/x-ms-wma", "codec": "wmav2", "lossless": False},
    "aac": {"description": "Advanced Audio Coding", "mime": "audio/aac", "codec": "aac", "lossless": False},
}


@dataclass
class AudioMetadata:
    duration: float
    sample_rate: int
    channels: int
    bit_depth: int | None = None
    bitrate: int | None = None
    format: str = "wav"
    frames: int = 0


class FormatValidationError(Exception):
    pass


class ConversionError(Exception):
    pass


class AudioFormatConverter:
    """Convert between audio formats and extract metadata.

    Uses pydub/ffmpeg for non-WAV formats; falls back to scipy for WAV.
    Requires ffmpeg installed for mp3/flac/ogg/m4a/wma/aac support.
    """

    def __init__(self):
        self._ffmpeg_available: bool | None = None
        self._pydub_available: bool | None = None

    def _check_ffmpeg(self) -> bool:
        if self._ffmpeg_available is not None:
            return self._ffmpeg_available
        import subprocess
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
            self._ffmpeg_available = True
        except (FileNotFoundError, subprocess.CalledProcessError):
            self._ffmpeg_available = False
        return self._ffmpeg_available

    def _check_pydub(self) -> bool:
        if self._pydub_available is not None:
            return self._pydub_available
        try:
            import pydub
            self._pydub_available = True
        except ImportError:
            self._pydub_available = False
        return self._pydub_available

    def validate_format(self, fmt: str) -> None:
        """Raise FormatValidationError if format is not supported."""
        if fmt.lower() not in SUPPORTED_FORMATS:
            raise FormatValidationError(
                f"Unsupported format: '{fmt}'. Supported: {list(SUPPORTED_FORMATS.keys())}"
            )

    def convert(
        self,
        input_path: str | Path,
        output_path: str | Path,
        output_format: str | None = None,
        sr: int | None = None,
        bitrate: str | None = None,
    ) -> Path:
        """Convert audio file to target format.

        Uses pydub (which wraps ffmpeg) for format conversion.
        Falls back to pure scipy for wav-to-wav conversion.

        Args:
            input_path: Source audio file path.
            output_path: Destination audio file path.
            output_format: Target format (inferred from extension if None).
            sr: Target sample rate (None = keep original).
            bitrate: Target bitrate e.g. "192k" (None = keep original).

        Returns:
            Path to the converted output file.

        Raises:
            FormatValidationError: If format is unsupported.
            ConversionError: If conversion fails.
        """
        input_path = Path(input_path)
        output_path = Path(output_path)

        fmt = (output_format or output_path.suffix.lstrip(".").lower())
        self.validate_format(fmt)

        input_ext = input_path.suffix.lstrip(".").lower()
        self.validate_format(input_ext)

        if input_path == output_path:
            raise ConversionError("Input and output paths must differ")

        try:
            if fmt == "wav" and input_ext == "wav" and sr is None:
                import soundfile as sf
                data, orig_sr = sf.read(str(input_path), dtype="float64")
                sf.write(str(output_path), data, orig_sr)
                return output_path

            if not self._check_pydub():
                raise ConversionError("pydub is required for non-WAV conversion (pip install pydub)")
            if not self._check_ffmpeg():
                raise ConversionError("ffmpeg is required for format conversion")

            from pydub import AudioSegment
            audio = AudioSegment.from_file(str(input_path))
            if sr is not None:
                audio = audio.set_frame_rate(sr)
            if bitrate is not None:
                audio = audio.set_sample_width(16).export(
                    str(output_path), format=fmt, bitrate=bitrate, parameters=["-aq", "2"]
                )
            else:
                audio.export(str(output_path), format=fmt)
            return output_path

        except FormatValidationError:
            raise
        except Exception as e:
            raise ConversionError(f"Failed to convert {input_path} to {fmt}: {e}")

    def get_metadata(self, path: str | Path) -> AudioMetadata:
        """Extract metadata from an audio file.

        Uses soundfile for WAV/FLAC, pydub for other formats.

        Args:
            path: Path to the audio file.

        Returns:
            AudioMetadata with duration, sample_rate, channels, bit_depth, etc.
        """
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        ext = path.suffix.lstrip(".").lower()
        self.validate_format(ext)

        if ext in ("wav", "flac", "aiff"):
            import soundfile as sf
            info = sf.info(str(path))
            return AudioMetadata(
                duration=info.duration,
                sample_rate=info.samplerate,
                channels=info.channels,
                bit_depth=getattr(info, "subtype", None),
                bitrate=None,
                format=ext,
                frames=info.frames,
            )

        if not self._check_pydub():
            raise ConversionError("pydub required for metadata extraction of non-WAV/FLAC/AIFF files")

        from pydub import AudioSegment
        audio = AudioSegment.from_file(str(path))
        return AudioMetadata(
            duration=audio.duration_seconds,
            sample_rate=audio.frame_rate,
            channels=audio.channels,
            bit_depth=audio.sample_width * 8,
            bitrate=getattr(audio, "frame_rate", None),
            format=ext,
            frames=audio.frame_count(),
        )

    def list_supported_formats(self) -> dict[str, dict[str, Any]]:
        """Return a copy of the supported formats registry."""
        return dict(SUPPORTED_FORMATS)
