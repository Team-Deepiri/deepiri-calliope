from fastapi import APIRouter

from calliope.audio.arrangement_plan import build_arrangement
from calliope.schemas import (
    AamatiAlignRequest,
    AamatiAlignResponse,
    AamatiComposeRequest,
    AamatiComposeResponse,
    AamatiMixSteerOut,
    AamatiSteerOut,
    BriefAnalysisOut,
    MoodScoreOut,
)
from calliope.services.aamati_prior import AamatiPrior, health_payload
from calliope.services.aamati_steer import ProductionSteer, format_steer_block, steer_from_alignment


def _steer_out(steer: ProductionSteer) -> AamatiSteerOut:
    return AamatiSteerOut(
        mood=steer.mood,
        mood_score=steer.mood_score,
        source=steer.source,
        bpm=steer.bpm,
        key=steer.key,
        scale_type=steer.scale_type,
        harmony_mood=steer.harmony_mood,
        drum_density=steer.drum_density,
        swing=steer.swing,
        fill_activity=steer.fill_activity,
        mix=AamatiMixSteerOut(**steer.mix.__dict__),
        rationale=steer.rationale,
    )

router = APIRouter(tags=["aamati"])


def _brief_out(b) -> BriefAnalysisOut:
    return BriefAnalysisOut(
        raw_text=b.raw_text,
        tempo_bpm=b.tempo_bpm,
        tempo_confidence=b.tempo_confidence,
        genres=b.genres,
        swing_bias=b.swing_bias,
        energy=b.energy,
        valence=b.valence,
        complexity=b.complexity,
        keywords=b.keywords,
    )


@router.get("/v1/aamati/health")
async def aamati_health() -> dict:
    p = AamatiPrior()
    return health_payload(p.root)


@router.get("/v1/aamati/groove-ontology")
async def groove_ontology() -> dict:
    return AamatiPrior().groove_ontology()


@router.post("/v1/aamati/align", response_model=AamatiAlignResponse)
async def align_brief(body: AamatiAlignRequest) -> AamatiAlignResponse:
    prior = AamatiPrior()
    res = prior.align(body.text)
    moods = [
        MoodScoreOut(
            mood=m.mood,
            score=m.score,
            emoji=m.emoji,
            feature_targets=m.feature_targets,
            table_summary=m.table_summary,
        )
        for m in res.ranked_moods
    ]
    return AamatiAlignResponse(
        brief=_brief_out(res.brief),
        ranked_moods=moods,
        ontology_version=res.ontology_version,
        onnx_mood=res.onnx_mood,
        onnx_probabilities=res.onnx_probabilities,
    )


@router.post("/v1/aamati/compose", response_model=AamatiComposeResponse)
async def compose_from_aamati(body: AamatiComposeRequest) -> AamatiComposeResponse:
    """Align the brief, then emit a full arrangement + mix knobs (no LLM)."""
    prior = AamatiPrior()
    alignment = prior.align(body.text)
    steer = steer_from_alignment(alignment.brief, alignment, constrain=body.constrain)
    genre = alignment.brief.genres[0] if alignment.brief.genres else "electronic"
    arrangement = build_arrangement(
        body.text,
        bpm=steer.bpm,
        key=steer.key,
        scale_type=steer.scale_type,
        genre=genre,
        mood=steer.harmony_mood,
        drum_density=steer.drum_density,
    )
    moods = [
        MoodScoreOut(
            mood=m.mood,
            score=m.score,
            emoji=m.emoji,
            feature_targets=m.feature_targets,
            table_summary=m.table_summary,
        )
        for m in alignment.ranked_moods[:5]
    ]
    return AamatiComposeResponse(
        constrain=body.constrain,
        steer=_steer_out(steer),
        ranked_moods=moods,
        arrangement=arrangement,
        llm_block=format_steer_block(steer),
    )
