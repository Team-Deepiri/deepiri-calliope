from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "calliope"


class OllamaStatusResponse(BaseModel):
    ok: bool
    running: bool
    base_url: str
    models: list[str] = Field(default_factory=list)
    message: str


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: str | None = None


class GenerateResponse(BaseModel):
    model: str
    response: str


class GenerationJobCreate(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)


class GenerationJobRead(BaseModel):
    id: UUID
    prompt: str
    status: str
    result_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AamatiHealthResponse(BaseModel):
    aamati_path: str
    mood_labels_loaded: bool
    detail: str | None = None
