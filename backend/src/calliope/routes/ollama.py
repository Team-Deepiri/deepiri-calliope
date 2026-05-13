from fastapi import APIRouter

from calliope.schemas import OllamaStatusResponse
from calliope.services.ollama_bridge import OllamaMusicBridge

router = APIRouter(tags=["ollama"])


@router.get("/v1/ollama/status", response_model=OllamaStatusResponse)
async def ollama_status() -> OllamaStatusResponse:
    raw = await OllamaMusicBridge().status()
    return OllamaStatusResponse(
        ok=bool(raw.get("ok")),
        running=bool(raw.get("running")),
        base_url=str(raw.get("base_url", "")),
        models=list(raw.get("models") or []),
        message=str(raw.get("message", "")),
    )
