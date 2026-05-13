from __future__ import annotations

from fastapi import APIRouter

from calliope.schemas import VoiceProcessIn, VoiceProcessOut
from calliope.voice.engine import process_voice_unit, report_to_metrics

router = APIRouter(tags=["voice"])


@router.post("/v1/voice/process", response_model=VoiceProcessOut)
async def voice_process(body: VoiceProcessIn) -> VoiceProcessOut:
    y, rep = process_voice_unit(
        body.samples,
        body.sample_rate,
        body.rack,
        demo_hz=body.demo_tone_hz,
        output_stereo=body.output_stereo,
    )
    if y.ndim == 2:
        left = y[:, 0]
        right = y[:, 1]
    else:
        left = right = y
    max_len = int(body.max_return_samples)
    truncated = left.size > max_len
    left = left[:max_len]
    right = right[:max_len]
    return VoiceProcessOut(
        channel_left=[float(x) for x in left.tolist()],
        channel_right=[float(x) for x in right.tolist()],
        sample_rate=body.sample_rate,
        metrics=report_to_metrics(rep),
        truncated=truncated,
    )
