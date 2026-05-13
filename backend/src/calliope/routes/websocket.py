"""WebSocket routes for real-time audio streaming and processing."""

from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import numpy as np

from calliope.audio.realtime import AudioStreamConfig, RealTimeAudioStream, AudioLevelMeter
from calliope.tune.gravy_autotune import auto_tune, AutotuneConfig, AutotuneMode, ScaleType
from calliope.voice.engine import process_voice_unit
from calliope.schemas import VocalRackIn

router = APIRouter(prefix="/ws", tags=["websocket"])


class AudioWSHandler:
    """WebSocket handler for real-time audio streaming."""

    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.stream: RealTimeAudioStream | None = None
        self.meter = AudioLevelMeter()
        self.autotune_config: AutotuneConfig | None = None
        self.vocal_rack: VocalRackIn | None = None
        self.is_processing = False

    async def handle_message(self, data: bytes) -> None:
        """Handle incoming WebSocket message."""
        try:
            msg = json.loads(data.decode("utf-8"))
            msg_type = msg.get("type")

            if msg_type == "start_stream":
                await self._start_stream(msg)
            elif msg_type == "stop_stream":
                await self._stop_stream()
            elif msg_type == "audio_data":
                await self._process_audio_data(msg)
            elif msg_type == "set_autotune":
                await self._set_autotune(msg)
            elif msg_type == "set_vocal_rack":
                await self._set_vocal_rack(msg)
            elif msg_type == "get_level":
                await self._send_level()
            elif msg_type == "apply_effects":
                await self._apply_effects(msg)

        except Exception as e:
            await self.ws.send_json({
                "type": "error",
                "message": str(e),
            })

    async def _start_stream(self, msg: dict) -> None:
        sr = msg.get("sample_rate", 48000)
        block_size = msg.get("block_size", 256)

        config = AudioStreamConfig(
            sample_rate=sr,
            block_size=block_size,
        )

        self.stream = RealTimeAudioStream(config)
        self.stream.start()

        await self.ws.send_json({
            "type": "stream_started",
            "sample_rate": sr,
            "block_size": block_size,
        })

    async def _stop_stream(self) -> None:
        if self.stream:
            self.stream.stop()
            self.stream = None

        await self.ws.send_json({
            "type": "stream_stopped",
        })

    async def _process_audio_data(self, msg: dict) -> None:
        if not self.stream:
            return

        audio_b64 = msg.get("audio")
        if not audio_b64:
            return

        audio_bytes = base64.b64decode(audio_b64)
        samples = np.frombuffer(audio_bytes, dtype=np.float32)

        rms_db, peak_db = self.meter.process(samples)

        if self.autotune_config:
            result = auto_tune(samples, 48000, self.autotune_config)
            processed = result.corrected_samples.astype(np.float32)
        elif self.vocal_rack:
            processed, _ = process_voice_unit(samples, 48000, self.vocal_rack)
            processed = processed.astype(np.float32)
        else:
            processed = samples.astype(np.float32)

        output_b64 = base64.b64encode(processed.tobytes()).decode("utf-8")

        await self.ws.send_json({
            "type": "processed_audio",
            "audio": output_b64,
            "rms_db": float(rms_db),
            "peak_db": float(peak_db),
        })

    async def _set_autotune(self, msg: dict) -> None:
        mode_map = {
            "auto": AutotuneMode.AUTO,
            "hard": AutotuneMode.HARD,
            "soft": AutotuneMode.SOFT,
            "melodic": AutotuneMode.MELODIC,
        }
        scale_map = {
            "major": ScaleType.MAJOR,
            "minor": ScaleType.MINOR,
            "harmonic_minor": ScaleType.HARMONIC_MINOR,
            "melodic_minor": ScaleType.MELODIC_MINOR,
            "dorian": ScaleType.DORIAN,
            "mixolydian": ScaleType.MIXOLYDIAN,
            "blues": ScaleType.BLUES,
            "pentatonic_major": ScaleType.PENTATONIC_MAJOR,
            "pentatonic_minor": ScaleType.PENTATONIC_MINOR,
            "chromatic": ScaleType.CHROMATIC,
        }

        self.autotune_config = AutotuneConfig(
            mode=mode_map.get(msg.get("mode", "auto"), AutotuneMode.AUTO),
            scale_type=scale_map.get(msg.get("scale_type", "major"), ScaleType.MAJOR),
            root_midi=msg.get("root_midi", 60),
            strength=msg.get("strength", 1.0),
            speed=msg.get("speed", 0.5),
            formant_correction=msg.get("formant_correction", True),
        )

        await self.ws.send_json({
            "type": "autotune_configured",
            "mode": msg.get("mode"),
            "scale_type": msg.get("scale_type"),
        })

    async def _set_vocal_rack(self, msg: dict) -> None:
        rack_data = msg.get("rack", {})
        self.vocal_rack = VocalRackIn(**rack_data)

        await self.ws.send_json({
            "type": "vocal_rack_configured",
        })

    async def _send_level(self) -> None:
        if self.stream:
            rms_db = self.stream.get_input_level()
        else:
            rms_db = -60.0

        await self.ws.send_json({
            "type": "level",
            "rms_db": float(rms_db),
        })

    async def _apply_effects(self, msg: dict) -> None:
        effect_type = msg.get("effect")

        if effect_type == "reverb":
            wet = msg.get("wet", 0.3)
            decay = msg.get("decay", 2.0)
            await self.ws.send_json({
                "type": "effect_configured",
                "effect": "reverb",
                "wet": wet,
                "decay": decay,
            })
        elif effect_type == "delay":
            time_ms = msg.get("time_ms", 250)
            feedback = msg.get("feedback", 0.4)
            await self.ws.send_json({
                "type": "effect_configured",
                "effect": "delay",
                "time_ms": time_ms,
                "feedback": feedback,
            })
        else:
            await self.ws.send_json({
                "type": "error",
                "message": f"Unknown effect: {effect_type}",
            })


@router.websocket("/audio")
async def audio_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time audio streaming.
    
    Client sends:
    - {"type": "start_stream", "sample_rate": 48000, "block_size": 256}
    - {"type": "audio_data", "audio": "<base64>"}
    - {"type": "set_autotune", "mode": "hard", "scale_type": "minor"}
    - {"type": "set_vocal_rack", "rack": {...}}
    - {"type": "stop_stream"}
    
    Server sends:
    - {"type": "stream_started", "sample_rate": 48000}
    - {"type": "processed_audio", "audio": "<base64>", "rms_db": -20.5, "peak_db": -10.2}
    - {"type": "error", "message": "..."}
    """
    await websocket.accept()
    handler = AudioWSHandler(websocket)

    try:
        while True:
            data = await websocket.receive_bytes()
            await handler.handle_message(data)
    except WebSocketDisconnect:
        if handler.stream:
            handler.stream.stop()
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass


@router.websocket("/meter")
async def meter_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time level metering.
    Used for VU meters and visual feedback.
    """
    await websocket.accept()
    meter = AudioLevelMeter()

    try:
        while True:
            data = await websocket.receive_bytes()

            try:
                msg = json.loads(data.decode("utf-8"))
                if msg.get("type") == "audio_data":
                    audio_b64 = msg.get("audio")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        samples = np.frombuffer(audio_bytes, dtype=np.float32)
                        
                        rms_db, peak_db = meter.process(samples)
                        
                        await websocket.send_json({
                            "type": "level",
                            "rms_db": float(rms_db),
                            "peak_db": float(peak_db),
                            "rms_smoothed": float(meter.get_rms_smoothed()),
                        })
            except Exception:
                pass

    except WebSocketDisconnect:
        meter.reset()
    except Exception:
        pass


@router.websocket("/tuner")
async def tuner_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time pitch detection and tuning display.
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_bytes()

            try:
                msg = json.loads(data.decode("utf-8"))
                if msg.get("type") == "analyze":
                    audio_b64 = msg.get("audio")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        samples = np.frombuffer(audio_bytes, dtype=np.float32)
                        sr = msg.get("sample_rate", 48000)

                        from calliope.pitch.yin import yin_track_series
                        f0 = yin_track_series(samples, sr, frame=2048, hop=512, fmin=70.0, fmax=900.0)

                        if len(f0) > 0:
                            avg_f0 = float(np.mean(f0[f0 > 0]))
                            if avg_f0 > 0:
                                midi_note = 69.0 + 12.0 * np.log2(avg_f0 / 440.0)
                                note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
                                note = note_names[int(round(midi_note)) % 12]
                                octave = int(round(midi_note)) // 12 - 1
                                cents = (midi_note - round(midi_note)) * 100

                                await websocket.send_json({
                                    "type": "pitch_info",
                                    "frequency": float(avg_f0),
                                    "note": note,
                                    "octave": octave,
                                    "cents": float(cents),
                                    "midi": float(midi_note),
                                })
            except Exception:
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass