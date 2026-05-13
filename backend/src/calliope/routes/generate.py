from fastapi import APIRouter

from calliope.schemas import GenerateRequest, GenerateResponse
from calliope.services.ollama_bridge import OllamaMusicBridge

router = APIRouter(tags=["generate"])


@router.post("/v1/generate/plan", response_model=GenerateResponse)
async def generate_plan(body: GenerateRequest) -> GenerateResponse:
    bridge = OllamaMusicBridge()
    model = body.model or bridge.default_model
    text = await bridge.generate_plan(body.prompt, model=model)
    return GenerateResponse(model=model, response=text)
