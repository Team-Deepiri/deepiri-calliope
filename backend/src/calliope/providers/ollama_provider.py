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

_model_cache: dict[str, tuple[float, list[str]]] = {}
_MODEL_CACHE_TTL = 60.0


async def _list_model_names(settings: Settings) -> list[str]:
    import time

    key = settings.ollama_base_url.rstrip("/")
    cached = _model_cache.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < _MODEL_CACHE_TTL:
        return cached[1]

    url = f"{key}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            names = [str(m.get("name", "")) for m in (data.get("models") or []) if m.get("name")]
            _model_cache[key] = (now, names)
            return names
    except Exception:
        return cached[1] if cached else []


def _pick_model(requested: str, available: list[str]) -> str:
    if not available:
        return requested
    if requested in available:
        return requested
    for name in available:
        if name == requested or name.endswith(f"/{requested}") or name.split(":")[0] == requested.split(":")[0]:
            return name
    for candidate in _FALLBACK_MODELS:
        for name in available:
            if name == candidate or name.startswith(candidate) or name.split(":")[0] == candidate.split(":")[0]:
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
    # Keep prompts bounded so local models finish before gateway timeouts.
    if len(system) > 2500:
        system = system[:2500] + "\n…"
    if len(user) > 4500:
        user = user[:4500] + "\n…"
    combined = f"{system}\n\n{user}"
    payload = {
        "model": resolved,
        "prompt": combined,
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "num_predict": int(settings.ollama_num_predict),
            "temperature": 0.65,
        },
    }
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    timeout = httpx.Timeout(settings.ollama_timeout_sec, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        if r.status_code == 404 and available:
            payload["model"] = _pick_model(_FALLBACK_MODELS[0], available)
            r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        text = str(data.get("response", ""))
        if not text.strip():
            raise RuntimeError(f"Ollama returned empty response for model {payload['model']}")
        return text
