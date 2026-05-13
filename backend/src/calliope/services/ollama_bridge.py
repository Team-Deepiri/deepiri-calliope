import json
from typing import Any

import httpx
from deepiri_ollama.runtime import check as ollama_check

from calliope.config import get_settings
from calliope.services.prompts import MUSIC_SYSTEM_PROMPT


class OllamaMusicBridge:
    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def default_model(self) -> str:
        return self._settings.ollama_model

    async def status(self) -> dict[str, Any]:
        return await ollama_check(self._settings.ollama_base_url)

    async def generate_plan(self, user_prompt: str, model: str | None = None) -> str:
        m = model or self._settings.ollama_model
        payload = {
            "model": m,
            "prompt": f"{MUSIC_SYSTEM_PROMPT}\n\nUser brief:\n{user_prompt}\n\nRespond with sections: Tempo, Harmony, Texture, Arrangement notes.",
            "stream": False,
        }
        url = f"{self._settings.ollama_base_url.rstrip('/')}/api/generate"
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()
            return str(data.get("response", ""))


async def ollama_json_tags(base_url: str) -> dict[str, Any]:
    """Thin helper around Ollama tags endpoint (complements deepiri-ollama-utils list_models)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(f"{base_url.rstrip('/')}/api/tags")
        r.raise_for_status()
        return json.loads(r.text)
