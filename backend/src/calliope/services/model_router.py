from calliope.config import Settings, get_settings
from calliope.providers import anthropic_provider, ollama_provider, openai_provider, openrouter_provider, gemini_provider
from calliope.providers.types import RouterProvider
from calliope.schemas import VocalRackIn
from calliope.services.prompt_builder import (
    Depth,
    build_system_prompt,
    build_user_payload,
)


def infer_provider_from_model(model: str) -> RouterProvider:
    m = model.strip()
    low = m.lower()
    if low.startswith("ollama/"):
        return RouterProvider.OLLAMA
    if low.startswith("claude-"):
        return RouterProvider.ANTHROPIC
    if low.startswith("gpt-") or low.startswith("o1") or low.startswith("o3") or low.startswith("ft:gpt"):
        return RouterProvider.OPENAI
    if low.startswith("gemini"):
        return RouterProvider.GEMINI
    if "/" in m:
        return RouterProvider.OPENROUTER
    return RouterProvider.OLLAMA


def normalize_model_id(provider: RouterProvider, model: str) -> str:
    low = model.strip().lower()
    if low.startswith("ollama/"):
        return model.split("/", 1)[1].strip()
    return model.strip()


def _default_model(provider: RouterProvider, settings: Settings) -> str:
    if provider is RouterProvider.OLLAMA:
        return settings.ollama_model
    if provider is RouterProvider.OPENAI:
        return settings.openai_default_model
    if provider is RouterProvider.ANTHROPIC:
        return settings.anthropic_default_model
    if provider is RouterProvider.OPENROUTER:
        return settings.openrouter_default_model
    if provider is RouterProvider.GEMINI:
        return settings.gemini_default_model
    return settings.ollama_model


def _parse_default_provider(settings: Settings) -> RouterProvider:
    raw = settings.default_llm_provider.strip().lower()
    if raw == "auto":
        return RouterProvider.OLLAMA
    try:
        return RouterProvider(raw)
    except ValueError:
        return RouterProvider.OLLAMA


def resolve_route(
    settings: Settings,
    *,
    provider: RouterProvider,
    model: str | None,
) -> tuple[RouterProvider, str]:
    if provider is RouterProvider.AUTO:
        if model:
            resolved = infer_provider_from_model(model)
            mid = normalize_model_id(resolved, model)
            return resolved, mid
        base = _parse_default_provider(settings)
        return base, _default_model(base, settings)

    resolved = provider
    mid = (model.strip() if model and model.strip() else _default_model(resolved, settings))
    if resolved is RouterProvider.OLLAMA:
        mid = normalize_model_id(RouterProvider.OLLAMA, mid)
    return resolved, mid


class ModelRouter:
    """Dispatches enriched music prompts to Ollama, OpenAI, Anthropic, or OpenRouter."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def generate_music_plan(
        self,
        user_prompt: str,
        *,
        model: str | None = None,
        provider: RouterProvider = RouterProvider.AUTO,
        depth: Depth = "standard",
        genre: str | None = None,
        bpm_hint: int | None = None,
        vocal_rack: VocalRackIn | None = None,
    ) -> tuple[str, str, str]:
        resolved, model_id = resolve_route(self._settings, provider=provider, model=model)
        system = build_system_prompt(depth)
        user = build_user_payload(
            user_prompt,
            depth=depth,
            genre_override=genre,
            bpm_override=bpm_hint,
            vocal_rack=vocal_rack,
        )

        if resolved is RouterProvider.OLLAMA:
            text = await ollama_provider.complete_chat(
                self._settings, model=model_id, system=system, user=user
            )
            return text, model_id, resolved.value

        if resolved is RouterProvider.OPENAI:
            text = await openai_provider.complete_chat(
                self._settings, model=model_id, system=system, user=user
            )
            return text, model_id, resolved.value

        if resolved is RouterProvider.ANTHROPIC:
            text = await anthropic_provider.complete_chat(
                self._settings, model=model_id, system=system, user=user
            )
            return text, model_id, resolved.value

        if resolved is RouterProvider.OPENROUTER:
            text = await openrouter_provider.complete_chat(
                self._settings, model=model_id, system=system, user=user
            )
            return text, model_id, resolved.value

        if resolved is RouterProvider.GEMINI:
            text = await gemini_provider.complete(
                prompt=user, model=model_id, system_prompt=system
            )
            return text, model_id, resolved.value

        raise RuntimeError(f"unsupported provider {resolved}")
