"""MIDI learn / controller mapping API routes."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["midi-learn"])


CurveType = Literal["linear", "exponential", "logarithmic", "s-curve"]


@dataclass
class MidiMapping:
    id: str
    controller_name: str
    parameter_path: str
    midi_channel: int = 0
    cc_number: int = 1
    min_range: float = 0.0
    max_range: float = 1.0
    curve_type: CurveType = "linear"


_mappings: dict[str, MidiMapping] = {}
_learn_mode: bool = False


class CreateMappingRequest(BaseModel):
    controller_name: str = Field(..., min_length=1, max_length=128)
    parameter_path: str = Field(..., min_length=1, max_length=256)
    midi_channel: int = Field(0, ge=0, le=15)
    cc_number: int = Field(1, ge=0, le=127)
    min_range: float = Field(0.0, ge=0.0, le=1.0)
    max_range: float = Field(1.0, ge=0.0, le=1.0)
    curve_type: CurveType = "linear"


class MappingResponse(BaseModel):
    id: str
    controller_name: str
    parameter_path: str
    midi_channel: int
    cc_number: int
    min_range: float
    max_range: float
    curve_type: str


@router.post("/v1/midi-learn/map", response_model=MappingResponse)
async def create_midi_mapping(body: CreateMappingRequest) -> MappingResponse:
    mapping = MidiMapping(
        id=uuid.uuid4().hex[:12],
        controller_name=body.controller_name,
        parameter_path=body.parameter_path,
        midi_channel=body.midi_channel,
        cc_number=body.cc_number,
        min_range=body.min_range,
        max_range=body.max_range,
        curve_type=body.curve_type,
    )
    _mappings[mapping.id] = mapping
    return MappingResponse(**asdict(mapping))


@router.get("/v1/midi-learn/mappings")
async def list_midi_mappings() -> dict:
    return {
        "mappings": [MappingResponse(**asdict(m)) for m in _mappings.values()],
        "total": len(_mappings),
    }


@router.delete("/v1/midi-learn/map/{mapping_id}")
async def delete_midi_mapping(mapping_id: str) -> dict:
    if mapping_id not in _mappings:
        raise HTTPException(status_code=404, detail="Mapping not found")
    del _mappings[mapping_id]
    return {"status": "deleted", "mapping_id": mapping_id}


@router.post("/v1/midi-learn/learn-mode")
async def toggle_learn_mode(enabled: bool = True) -> dict:
    global _learn_mode
    _learn_mode = enabled
    return {"learn_mode": _learn_mode, "status": "active" if _learn_mode else "inactive"}


@router.get("/v1/midi-learn/status")
async def get_midi_learn_status() -> dict:
    return {
        "learn_mode": _learn_mode,
        "mapping_count": len(_mappings),
        "mappings": [MappingResponse(**asdict(m)) for m in _mappings.values()],
    }


@router.post("/v1/midi-learn/forget")
async def forget_all_mappings() -> dict:
    global _mappings, _learn_mode
    count = len(_mappings)
    _mappings.clear()
    _learn_mode = False
    return {"status": "cleared", "mappings_removed": count, "learn_mode": False}
