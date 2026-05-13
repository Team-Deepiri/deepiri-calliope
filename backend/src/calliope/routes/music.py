from fastapi import APIRouter

from calliope.music import analyze_brief_text, plan_structure
from calliope.schemas import MusicAnalyzeRequest, MusicAnalyzeResponse, MusicSectionOut

router = APIRouter(tags=["music"])


@router.post("/v1/music/analyze", response_model=MusicAnalyzeResponse)
async def analyze_brief(body: MusicAnalyzeRequest) -> MusicAnalyzeResponse:
    brief = analyze_brief_text(body.text)
    struct = plan_structure(brief)
    return MusicAnalyzeResponse(
        tempo_bpm=brief.tempo_bpm,
        tempo_confidence=brief.tempo_confidence,
        genres=brief.genres,
        swing_bias=brief.swing_bias,
        energy=brief.energy,
        valence=brief.valence,
        complexity=brief.complexity,
        total_bars=struct.total_bars,
        sections=[MusicSectionOut(name=s.name, bars=s.bars, role=s.role) for s in struct.sections],
    )
