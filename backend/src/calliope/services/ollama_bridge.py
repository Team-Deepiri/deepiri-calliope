import json
from typing import Any

import httpx
from deepiri_ollama.runtime import check as ollama_check

from calliope.config import get_settings
from calliope.providers.types import RouterProvider
from calliope.services.model_router import ModelRouter


class OllamaMusicBridge:
    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def default_model(self) -> str:
        return self._settings.ollama_model

    async def status(self) -> dict[str, Any]:
        return await ollama_check(self._settings.ollama_base_url)

    async def generate_plan(self, user_prompt: str, model: str | None = None) -> str:
        router = ModelRouter(self._settings)
        text, _, _ = await router.generate_music_plan(
            user_prompt,
            model=model,
            provider=RouterProvider.OLLAMA,
        )
        return text


async def ollama_json_tags(base_url: str) -> dict[str, Any]:
    """Thin helper around Ollama tags endpoint (complements deepiri-ollama-utils list_models)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{base_url.rstrip('/')}/api/tags")
        r.raise_for_status()
        return json.loads(r.text)
