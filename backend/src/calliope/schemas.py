from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from calliope.providers.types import RouterProvider

GenerateDepth = Literal["standard", "deep"]

VocalRole = Literal[
    "instrumental_focus",
    "single_lead",
    "stacked_doubles",
    "call_and_response",
    "choir_gang",
    "whisper_layer",
    "spoken_wordcut",
    "vocoder_synth",
]


class VocalRackIn(BaseModel):
    """Studio vocal-chain targets (0–100). Serialized into the architect user payload."""

    role: VocalRole = "single_lead"
    breath_air: int = Field(32, ge=0, le=100, description="Top-end air / breathiness in the vocal tone")
    chest_body: int = Field(58, ge=0, le=100, description="Low-mid body / chest weight")
    presence_bite: int = Field(46, ge=0, le=100, description="Upper-mid presence and edge")
    de_esser: int = Field(52, ge=0, le=100, description="Sibilance taming amount (higher = more tame)")
    saturation_drive: int = Field(22, ge=0, le=100, description="Harmonic color / tape or tube saturation")
    width_stereo: int = Field(42, ge=0, le=100, description="Stereo spread, doubles, micro-shift")
    room_send: int = Field(28, ge=0, le=100, description="Short room / plate sense around the voice")
    delay_throw: int = Field(18, ge=0, le=100, description="Slap / 1/8-dotted throws on tails or phrases")
    tune_tightness: int = Field(74, ge=0, le=100, description="Pitch correction transparency vs obvious effect")
    formant_shift: int = Field(50, ge=0, le=100, description="50 neutral; lower darker, higher brighter formants")


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
    vocal_rack: VocalRackIn | None = Field(
        None,
        description="Optional vocal production targets from the Studio rack UI",
    )


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


class BriefAnalysisOut(BaseModel):
    raw_text: str
    tempo_bpm: int | None
    tempo_confidence: float
    genres: list[str]
    swing_bias: float
    energy: float
    valence: float
    complexity: float
    keywords: list[str]


class MoodScoreOut(BaseModel):
    mood: str
    score: float
    emoji: str | None = None
    feature_targets: dict[str, str] = Field(default_factory=dict)
    table_summary: str | None = None


class AamatiAlignRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class AamatiAlignResponse(BaseModel):
    brief: BriefAnalysisOut
    ranked_moods: list[MoodScoreOut]
    ontology_version: str
    onnx_mood: str | None = None
    onnx_probabilities: dict[str, float] | None = None


# --- Science / DSP lab (numpy-backed, bounded buffers) ---


class ScienceBufferIn(BaseModel):
    """Mono float samples in [-1, 1] preferred; empty list uses a short demo sine."""

    samples: list[float] = Field(default_factory=list)
    sample_rate: int = Field(48_000, ge=8_000, le=96_000)
    demo_tone_hz: float | None = Field(
        default=220.0,
        ge=20.0,
        le=4_000.0,
        description="Used when `samples` is empty: 0.25 s sine at this frequency.",
    )

    model_config = {"extra": "forbid"}

    @field_validator("samples")
    @classmethod
    def _cap_samples(cls, v: list[float]) -> list[float]:
        if len(v) > 480_000:
            raise ValueError("samples: at most 480000 points (~10 s at 48 kHz)")
        return v


class SciencePitchContourOut(BaseModel):
    f0_hz: list[float]
    hop_samples: int
    frame_samples: int


class ScienceMfccOut(BaseModel):
    mfcc_mean: list[float]
    sample_rate: int


class ScienceAutotunePlanOut(BaseModel):
    target_hz: list[float]
    ratios: list[float]
    sample_rate: int


class ScienceFeaturesOut(BaseModel):
    integrated_rms_dbfs: float
    weighted_rms_dbfs: float
    true_peak: float
    zcr_mean: float
    spectral_centroid_hz: float
    spectral_tilt_db_per_oct: float
    band_low: float
    band_mid: float
    band_high: float
    sample_rate: int


class SciencePitchShiftIn(ScienceBufferIn):
    """Same buffer contract as `ScienceBufferIn` plus global pitch shift in semitones."""

    semitones: float = Field(0.0, ge=-24.0, le=24.0)
    n_fft: int = Field(2048, ge=256, le=8192)
    hop_samples: int = Field(512, ge=32, le=2048)

    @model_validator(mode="after")
    def _hop_lt_nfft(self) -> Self:
        if self.hop_samples >= self.n_fft:
            raise ValueError("hop_samples must be less than n_fft")
        return self


class ScienceWaveformOut(BaseModel):
    samples: list[float]
    sample_rate: int
    truncated: bool = False


class ScienceAutotuneRenderIn(ScienceBufferIn):
    """Pitch-correct toward ET or a major scale using YIN + warp map; optional dry/wet blend."""

    strength: float = Field(1.0, ge=0.0, le=1.0, description="Dry/wet mix after full warp path.")
    warp_exponent: float = Field(
        1.0,
        ge=0.0,
        le=1.0,
        description="Exponent inside per-frame (f0/target) ratio before smoothing (1 = full correction).",
    )
    et_snap: bool = Field(True, description="If true, snap to equal temperament; else use major scale.")
    major_root_midi: int = Field(60, ge=0, le=127, description="Tonic MIDI note when `et_snap` is false.")
    max_return_samples: int = Field(
        96_000,
        ge=1024,
        le=480_000,
        description="Truncate returned waveform to this many samples from the start (JSON size guard).",
    )


class ScienceChromaOut(BaseModel):
    chroma: list[float]
    sample_rate: int


class ScienceOnsetsOut(BaseModel):
    onset_frame_indices: list[int]
    hop_samples: int
    n_fft: int
