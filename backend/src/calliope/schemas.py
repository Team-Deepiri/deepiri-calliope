from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, Field

from calliope.providers.types import RouterProvider

GenerateDepth = Literal["standard", "deep"]


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
    provider: RouterProvider = RouterProvider.AUTO
    depth: GenerateDepth = "standard"
    genre: str | None = Field(None, max_length=200, description="Comma-separated genre override")
    bpm_hint: int | None = Field(None, ge=20, le=300)


class GenerateResponse(BaseModel):
    model: str
    response: str
    provider: str
    depth: GenerateDepth = "standard"


class MusicSectionOut(BaseModel):
    name: str
    bars: int
    role: str


class MusicAnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class MusicAnalyzeResponse(BaseModel):
    tempo_bpm: int | None
    tempo_confidence: float
    genres: list[str]
    swing_bias: float
    energy: float
    valence: float
    complexity: float
    total_bars: int
    sections: list[MusicSectionOut]


class RouterProvidersResponse(BaseModel):
    """Which remote providers have API keys configured (never exposes secrets)."""

    openai: bool
    anthropic: bool
    openrouter: bool
    ollama: bool = True
    defaults: dict[str, str]


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
