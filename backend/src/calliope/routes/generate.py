from fastapi import APIRouter, HTTPException

from calliope.schemas import GenerateRequest, GenerateResponse, RouterProvidersResponse
from calliope.services.model_router import ModelRouter

router = APIRouter(tags=["generate"])


@router.post("/v1/generate/plan", response_model=GenerateResponse)
async def generate_plan(body: GenerateRequest) -> GenerateResponse:
    router_ = ModelRouter()
    try:
        text, model_id, prov = await router_.generate_music_plan(
            body.prompt,
            model=body.model,
            provider=body.provider,
            depth=body.depth,
            genre=body.genre,
            bpm_hint=body.bpm_hint,
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream LLM error: {e!s}") from e
    return GenerateResponse(model=model_id, response=text, provider=prov, depth=body.depth)


@router.get("/v1/router/providers", response_model=RouterProvidersResponse)
async def router_providers() -> RouterProvidersResponse:
    from calliope.config import get_settings

    s = get_settings()
    return RouterProvidersResponse(
        openai=s.provider_key_configured("openai"),
        anthropic=s.provider_key_configured("anthropic"),
        openrouter=s.provider_key_configured("openrouter"),
        ollama=True,
        defaults={
            "llm_provider": s.default_llm_provider,
            "ollama_model": s.ollama_model,
            "openai_model": s.openai_default_model,
            "anthropic_model": s.anthropic_default_model,
            "openrouter_model": s.openrouter_default_model,
        },
    )
