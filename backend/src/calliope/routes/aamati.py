from fastapi import APIRouter

from calliope.schemas import (
    AamatiAlignRequest,
    AamatiAlignResponse,
    BriefAnalysisOut,
    MoodScoreOut,
)
from calliope.services.aamati_prior import AamatiPrior, health_payload

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
