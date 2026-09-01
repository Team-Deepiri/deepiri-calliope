from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from calliope.audio.io import AudioReadError, read_audio_file, write_audio_file
from calliope.config import get_settings
from calliope.schemas import VocalRackIn
from calliope.voice.engine import process_voice_unit, report_to_metrics

router = APIRouter(tags=["ai-vocal"])


class AiVocalSynthesizeIn(BaseModel):
    lyrics: str = Field("", description="Lyrics to speak and retune onto a melody")
    voice_model: str = Field("tenor")
    tuning_strength: float = Field(0.8, ge=0, le=1)
    arrangement_style: str = Field("verse-chorus")
    vocal_style: str = Field("lead")
    genre_preset: str = Field("pop")
    genre_settings: dict[str, Any] = Field(default_factory=dict)
    bpm: float | None = Field(None, ge=40, le=240)
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
    recording_id: str | None = None
    session_id: str | None = None
    filename: str = ""
    source: str = "demo_tone"
    metrics: dict[str, Any] = Field(default_factory=dict)
    truncated: bool = False


def _resolve_recording_path(session_id: str, recording_id: str) -> Path | None:
    base = get_settings().recordings_path / session_id
    for ext in ("wav", "webm", "ogg", "mp3", "flac"):
        path = base / f"{recording_id}.{ext}"
        if path.is_file():
            return path
    return None


def _load_recording_samples(session_id: str, recording_id: str) -> tuple[list[float], int] | None:
    path = _resolve_recording_path(session_id, recording_id)
    if path is None:
        return None
    try:
        audio, file_sr = read_audio_file(path, mono=True)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        return audio.tolist(), file_sr
    except (AudioReadError, OSError):
        return None


def _unit_to_percent(value: Any) -> int:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return 50
    if x <= 1.0:
        x *= 100.0
    return int(np.clip(round(x), 0, 100))


def _rack_from_body(body: AiVocalSynthesizeIn) -> VocalRackIn:
    rack_dict = body.rack.model_dump()
    gs = body.genre_settings or {}
    if "tuning" in gs:
        rack_dict["tune_tightness"] = _unit_to_percent(gs["tuning"])
    if "reverb" in gs:
        rack_dict["room_send"] = _unit_to_percent(gs["reverb"])
    if "compression" in gs:
        rack_dict["punch_snap"] = _unit_to_percent(gs["compression"])
    rack_dict["tune_tightness"] = _unit_to_percent(body.tuning_strength)
    return VocalRackIn(**{k: v for k, v in rack_dict.items() if k in VocalRackIn.model_fields})


def _preview_waveform(mono: np.ndarray, points: int = 2000) -> list[float]:
    if mono.size == 0:
        return []
    n = min(points, int(mono.size))
    if mono.size <= n:
        return mono.astype(float).tolist()
    edges = np.linspace(0, mono.size, n + 1).astype(int)
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        chunk = mono[edges[i] : edges[i + 1]]
        if chunk.size == 0:
            out[i] = 0.0
            continue
        peak = float(np.max(np.abs(chunk)))
        out[i] = peak if float(chunk[chunk.size // 2]) >= 0 else -peak
    return out.tolist()


def _synthesize_from_lyrics(body: AiVocalSynthesizeIn) -> tuple[np.ndarray, dict[str, Any]]:
    from calliope.audio.speech_to_singing import synthesize_speech_to_singing
    from calliope.audio.svs_diffsinger import synthesize_diffsinger
    from calliope.audio.vocal_melody_ml import melody_model_id
    from calliope.audio.vocal_synth import AIVocalSynthesizer, lyric_tokens, melody_from_lyrics

    melody = melody_from_lyrics(
        body.lyrics,
        voice_name=body.voice_model,
        genre_preset=body.genre_preset,
        arrangement_style=body.arrangement_style,
        vocal_style=body.vocal_style,
        bpm=body.bpm,
    )
    extra: dict[str, Any] = {
        "syllables": len(lyric_tokens(body.lyrics)),
        "notes": len(melody),
        "voice_model": body.voice_model,
        "genre_preset": body.genre_preset,
        "arrangement_style": body.arrangement_style,
        "vocal_style": body.vocal_style,
        "melody_model": melody_model_id(),
    }
    # OpenCpop DiffSinger is Mandarin; English through it is unintelligible warble.
    # Opt in with CALLIOPE_TTS_BACKEND=diffsinger. Default is Piper (words first).
    if (os.environ.get("CALLIOPE_TTS_BACKEND") or "").strip().lower() == "diffsinger":
        sung_ml = synthesize_diffsinger(
            body.lyrics,
            melody,
            sr=body.sample_rate,
            voice_name=body.voice_model,
        )
        if sung_ml is not None:
            extra["source"] = "lyrics_svs"
            extra["tts_backend"] = "diffsinger"
            return sung_ml, extra

    sung = synthesize_speech_to_singing(
        body.lyrics,
        melody,
        voice_name=body.voice_model,
        vocal_style=body.vocal_style,
        sr=body.sample_rate,
    )
    if sung is not None:
        raw, backend = sung
        extra["source"] = "lyrics_sts"
        extra["tts_backend"] = backend
        return raw, extra

    synth = AIVocalSynthesizer(sr=body.sample_rate)
    raw = synth.synthesize(
        body.lyrics,
        melody,
        voice_name=body.voice_model,
        vocal_style=body.vocal_style,
    )
    extra["source"] = "lyrics_formant"
    extra["tts_backend"] = "formant"
    return raw, extra


def _write_output(
    y: np.ndarray,
    sr: int,
    body: AiVocalSynthesizeIn,
    source: str,
) -> tuple[str, str | None, str]:
    """Persist the full render. Prefer a session file so Studio can place a clip."""
    if y.ndim == 2:
        audio = y
    else:
        audio = y

    if body.session_id:
        try:
            from calliope.routes.recordings import write_and_register_session_wav

            label = "Generated vocal.wav" if source.startswith("lyrics_") else "Enhanced vocal.wav"
            meta = write_and_register_session_wav(
                body.session_id,
                audio,
                sr,
                original_name=label,
                track_type="vocal",
            )
            rec_id = str(meta["id"])
            url = f"/v1/recordings/sessions/{body.session_id}/files/{rec_id}/download"
            return url, rec_id, str(meta.get("filename") or f"{rec_id}.wav")
        except HTTPException:
            pass

    out_id = f"{body.recording_id or uuid4().hex[:8]}_{source}"
    out_path = get_settings().recordings_path / "enhanced" / f"{out_id}.wav"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        write_audio_file(out_path, audio, sr, format="wav")
    except (AudioReadError, OSError):
        return "", None, ""
    return f"/v1/recordings/enhanced/{out_id}.wav", None, f"{out_id}.wav"


def _synthesize_vocal_sync(body: AiVocalSynthesizeIn) -> AiVocalSynthesizeOut:
    """Blocking vocal synthesis — run via asyncio.to_thread from the route handler."""
    samples: list[float] = []
    sr = body.sample_rate
    source = "demo_tone"
    extra: dict[str, Any] = {}

    if body.recording_id and body.session_id:
        loaded = _load_recording_samples(body.session_id, body.recording_id)
        if loaded is not None:
            samples, sr = loaded
            source = "recording"

    if not samples and body.lyrics.strip():
        raw, extra = _synthesize_from_lyrics(body)
        samples = raw.tolist()
        sr = body.sample_rate
        source = extra.get("source") or "lyrics_svs"

    rack = _rack_from_body(body)
    if source in {"lyrics_sts", "lyrics_svs"}:
        # Neural takes already have pitch; autotune/grit was adding robot + noise.
        rack = rack.model_copy(
            update={
                "tune_tightness": 0,
                "grit_parallel": min(rack.grit_parallel, 10),
                "saturation_drive": min(rack.saturation_drive, 14),
                "punch_snap": min(rack.punch_snap, 32),
                "formant_shift": 50,
            }
        )
    y, rep = process_voice_unit(
        samples,
        sr,
        rack,
        demo_hz=None if samples else 220.0,
        output_stereo=body.output_stereo,
    )

    if y.ndim == 2:
        mono = (y[:, 0] + y[:, 1]) / 2
    else:
        mono = y

    output_file, recording_id, filename = _write_output(y, sr, body, source)
    max_len = body.max_return_samples
    truncated = int(mono.size) > max_len
    metrics = report_to_metrics(rep)
    metrics.update(extra)
    metrics["source"] = source

    return AiVocalSynthesizeOut(
        waveform=_preview_waveform(mono),
        sample_rate=sr,
        duration_sec=round(float(mono.size) / sr, 3) if sr else 0,
        output_file=output_file,
        recording_id=recording_id,
        session_id=body.session_id,
        filename=filename,
        source=source,
        metrics=metrics,
        truncated=truncated,
    )


@router.post("/v1/ai-vocal/synthesize", response_model=AiVocalSynthesizeOut)
async def ai_vocal_synthesize(body: AiVocalSynthesizeIn) -> AiVocalSynthesizeOut:
    """Generate a sung vocal from lyrics, or enhance an existing recording.

    Lyrics prefer local Piper neural TTS so the words stay intelligible.
    DiffSinger is opt-in (CALLIOPE_TTS_BACKEND=diffsinger). Formant SVS is
    the last fallback. A recording id still takes priority.
    """
    return await asyncio.to_thread(_synthesize_vocal_sync, body)
