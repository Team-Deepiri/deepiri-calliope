"""Map `VocalRackIn` UI knobs (0–100) to DSP parameters for `VoiceEngine`."""

from __future__ import annotations

from dataclasses import dataclass

from calliope.schemas import VocalRackIn


@dataclass(frozen=True)
class VoiceDSPParams:
    hp_hz: float
    body_db: float
    air_db: float
    presence_db: float
    gate_threshold_db: float
    comp_threshold_db: float
    comp_ratio: float
    comp_makeup_db: float
    deesser_amount: float
    formant_shift: float
    tune_blend: float
    drive: float
    reverb_wet: float
    reverb_t60: float
    delay_ms: float
    delay_feedback: float
    delay_wet: float
    width: float
    haas_ms: float
    bypass_chain: bool


def rack_to_params(r: VocalRackIn) -> VoiceDSPParams:
    """Translate normalized rack sliders into bounded engineering values."""
    body_db = (r.chest_body - 50) / 50.0 * 4.5
    air_db = (r.breath_air - 50) / 50.0 * 5.5
    presence_db = (r.presence_bite - 50) / 50.0 * 7.0
    gate_thr = -44.0 - (r.breath_air / 100.0) * 16.0
    comp_thr = -26.0 - (r.chest_body - 50) * 0.04
    ratio = 2.0 + (r.presence_bite / 100.0) * 2.5
    makeup = (r.chest_body - 50) / 100.0 * 1.2
    deesser_amt = (r.de_esser / 100.0) * 0.78
    formant = 0.88 + (r.formant_shift / 100.0) * 0.24
    tune_blend = (r.tune_tightness / 100.0) ** 1.15
    drive = (r.saturation_drive / 100.0) * 2.35
    rev_wet = (r.room_send / 100.0) * 0.32
    t60 = 0.18 + (r.room_send / 100.0) * 0.55
    d_ms = 40.0 + (r.delay_throw / 100.0) * 220.0
    d_fb = (r.delay_throw / 100.0) * 0.48
    d_wet = (r.delay_throw / 100.0) * 0.38
    width = (r.width_stereo / 100.0) ** 0.85
    haas = (r.width_stereo / 100.0) * 11.0
    bypass = r.role == "instrumental_focus"
    return VoiceDSPParams(
        hp_hz=55.0,
        body_db=body_db,
        air_db=air_db,
        presence_db=presence_db,
        gate_threshold_db=gate_thr,
        comp_threshold_db=comp_thr,
        comp_ratio=ratio,
        comp_makeup_db=makeup,
        deesser_amount=deesser_amt,
        formant_shift=formant,
        tune_blend=tune_blend,
        drive=drive,
        reverb_wet=rev_wet,
        reverb_t60=t60,
        delay_ms=d_ms,
        delay_feedback=d_fb,
        delay_wet=d_wet,
        width=width,
        haas_ms=haas,
        bypass_chain=bypass,
    )
