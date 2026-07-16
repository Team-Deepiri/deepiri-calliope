import httpx

from calliope.config import Settings

# Prefer smaller / faster models when the configured one is missing or too slow.
_FALLBACK_MODELS = (
    "gemma2:9b",
    "qwen2.5:14b",
    "phi4:14b",
    "gemma2:27b",
    "mistral",
    "llama3.2",
    "llama3.1",
)


async def _list_model_names(settings: Settings) -> list[str]:
    url = f"{settings.ollama_base_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            return [str(m.get("name", "")) for m in (data.get("models") or []) if m.get("name")]
    except Exception:
        return []


def _pick_model(requested: str, available: list[str]) -> str:
    if not available:
        return requested
    if requested in available:
        return requested
    # Exact tag match without registry prefix
    for name in available:
        if name == requested or name.endswith(f"/{requested}") or name.split(":")[0] == requested.split(":")[0]:
            return name
    for candidate in _FALLBACK_MODELS:
        for name in available:
            if name == candidate or name.startswith(f"{candidate}") or name.split(":")[0] == candidate.split(":")[0]:
                return name
    return available[0]


async def complete_chat(
    settings: Settings,
    *,
    model: str,
    system: str,
    user: str,
) -> str:
    available = await _list_model_names(settings)
    resolved = _pick_model(model, available)
    combined = f"{system}\n\n{user}"
    payload = {
        "model": resolved,
        "prompt": combined,
        "stream": False,
        "options": {
            "num_predict": int(settings.ollama_num_predict),
            "temperature": 0.7,
        },
    }
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    timeout = httpx.Timeout(settings.ollama_timeout_sec, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        if r.status_code == 404 and available:
            # Model pull/name mismatch — retry once with best available fallback.
            payload["model"] = _pick_model(_FALLBACK_MODELS[0], available)
            r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        text = str(data.get("response", ""))
        if not text.strip():
            raise RuntimeError(f"Ollama returned empty response for model {payload['model']}")
        return text
