from __future__ import annotations

import struct
import wave
from typing import Any

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from calliope.schemas import VocalRackIn
from calliope.voice.engine import process_voice_unit, report_to_metrics

router = APIRouter(tags=["ai-vocal"])


class AiVocalSynthesizeIn(BaseModel):
    lyrics: str = Field("", description="Optional lyrics/prompt for context")
    voice_model: str = Field("tenor")
    tuning_strength: float = Field(0.8, ge=0, le=1)
    arrangement_style: str = Field("verse-chorus")
    vocal_style: str = Field("lead")
    genre_preset: str = Field("pop")
    genre_settings: dict[str, Any] = Field(default_factory=dict)
    recording_id: str | None = Field(
        None,
        description="Existing recording to enhance. If provided, the server loads "
        "and processes it through the voice engine with the given rack settings.",
    )
    session_id: str | None = None
    rack: VocalRackIn = Field(default_factory=VocalRackIn)
    output_stereo: bool = True
    sample_rate: int = Field(48_000, ge=8_000, le=96_000)
    max_return_samples: int = Field(192_000, ge=1024, le=960_000)


class AiVocalSynthesizeOut(BaseModel):
    waveform: list[float] = Field(default_factory=list)
    sample_rate: int = 48_000
    duration_sec: float = 0
    output_file: str = ""
    metrics: dict[str, Any] = Field(default_factory=dict)
    truncated: bool = False


@router.post("/v1/ai-vocal/synthesize", response_model=AiVocalSynthesizeOut)
async def ai_vocal_synthesize(body: AiVocalSynthesizeIn) -> AiVocalSynthesizeOut:
    """Enhance a recorded vocal through the Calliope voice engine.

    If ``recording_id`` + ``session_id`` are provided the server attempts to
    load the audio file from the recordings directory.  Otherwise a demo tone
    is generated so the endpoint is always callable for testing.
    """
    samples: list[float] = []
    sr = body.sample_rate

    # Try to load a real recording when identifiers are given.
    if body.recording_id and body.session_id:
        from calliope.config import get_settings

        base = get_settings().recordings_path / body.session_id
        for ext in ("wav", "webm", "ogg", "mp3", "flac"):
            path = base / f"{body.recording_id}.{ext}"
            if path.exists():
                try:
                    import soundfile as sf

                    audio, file_sr = sf.read(str(path), dtype="float32")
                    sr = file_sr
                    if audio.ndim > 1:
                        audio = audio.mean(axis=1)
                    samples = audio.tolist()
                except Exception:
                    # Fallback: read raw PCM via wave module
                    try:
                        with wave.open(str(path), "rb") as wf:
                            sr = wf.getframerate()
                            n = wf.getnframes()
                            raw = wf.readframes(n)
                            if wf.getsampwidth() == 2:
                                ints = struct.unpack(f"<{n}", raw[: n * 2])
                                samples = [x / 32768.0 for x in ints]
                            elif wf.getsampwidth() == 4:
                                ints = struct.unpack(f"<{n}", raw[: n * 4])
                                samples = [x / 2147483648.0 for x in ints]
                    except Exception:
                        pass
                break

    # Apply genre-influenced rack overrides.
    rack_dict = body.rack.model_dump()
    if body.genre_settings:
        if "tuning" in body.genre_settings:
            rack_dict["pitch_correction"] = body.genre_settings["tuning"]
        if "reverb" in body.genre_settings:
            rack_dict["reverb_amount"] = body.genre_settings["reverb"]
        if "compression" in body.genre_settings:
            rack_dict["compression"] = body.genre_settings["compression"]
    # Apply the global tuning strength slider.
    rack_dict["pitch_correction"] = body.tuning_strength

    from calliope.schemas import VocalRackIn as _VRI

    rack = _VRI(**{k: v for k, v in rack_dict.items() if k in _VRI.model_fields})

    y, rep = process_voice_unit(
        samples,
        sr,
        rack,
        demo_tone_hz=None if samples else 220.0,
        output_stereo=body.output_stereo,
    )

    max_len = body.max_return_samples
    if y.ndim == 2:
        left, right = y[:, 0], y[:, 1]
    else:
        left = right = y
    truncated = left.size > max_len
    left, right = left[:max_len], right[:max_len]
    waveform = ((left + right) / 2).tolist() if left.size == right.size else left.tolist()

    # Persist processed audio so it can be downloaded / previewed.
    from calliope.config import get_settings as _gs

    out_id = f"{body.recording_id or 'demo'}_enhanced"
    out_path = _gs().recordings_path / "enhanced" / f"{out_id}.wav"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with wave.open(str(out_path), "wb") as wf:
            wf.setnchannels(2 if body.output_stereo else 1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            if body.output_stereo and y.ndim == 2:
                interleave = np.column_stack([left, right]).flatten()
            else:
                interleave = left
            wf.writeframes((np.clip(interleave, -1, 1) * 32767).astype(np.int16).tobytes())
    except Exception:
        pass

    return AiVocalSynthesizeOut(
        waveform=waveform[:4000],
        sample_rate=sr,
        duration_sec=round(len(waveform) / sr, 3) if sr else 0,
        output_file=f"/v1/recordings/enhanced/{out_id}.wav",
        metrics=report_to_metrics(rep),
        truncated=truncated,
    )
