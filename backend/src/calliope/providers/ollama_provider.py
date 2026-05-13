import httpx

from calliope.config import Settings


async def complete_chat(
    settings: Settings,
    *,
    model: str,
    system: str,
    user: str,
) -> str:
    combined = f"{system}\n\n{user}"
    payload = {"model": model, "prompt": combined, "stream": False}
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        return str(data.get("response", ""))
