"""Google Gemini API provider."""

from __future__ import annotations

import json
from typing import Any

import httpx

from calliope.config import get_settings


async def complete_chat(
    messages: list[dict[str, Any]],
    model: str = "gemini-2.0-flash",
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> str:
    """
    Complete a chat using Google Gemini API.
    """
    settings = get_settings()

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    base_url = settings.gemini_base_url.rstrip("/")

    url = f"{base_url}/models/{model}:generateContent?key={settings.gemini_api_key}"

    formatted_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        if role == "system":
            role = "user"
        
        if isinstance(msg.get("content"), list):
            text_parts = []
            for part in msg["content"]:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
            if text_parts:
                formatted_messages.append({
                    "role": role,
                    "parts": [{"text": " ".join(text_parts)}]
                })
        elif isinstance(msg.get("content"), str):
            formatted_messages.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })

    payload = {
        "contents": formatted_messages,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "topP": 0.95,
            "topK": 40,
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()

    data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {data}")

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])

    if not parts:
        raise RuntimeError(f"Gemini returned no parts: {data}")

    return parts[0].get("text", "")


async def complete(
    prompt: str,
    model: str = "gemini-2.0-flash",
    temperature: float = 0.7,
    max_tokens: int = 4096,
    system_prompt: str | None = None,
) -> str:
    """
    Complete a prompt using Google Gemini API.
    """
    messages = []
    
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": prompt})

    return await complete_chat(messages, model, temperature, max_tokens)


async def stream_complete(
    prompt: str,
    model: str = "gemini-2.0-flash",
    temperature: float = 0.7,
    max_tokens: int = 4096,
    system_prompt: str | None = None,
):
    """
    Stream completion using Google Gemini API.
    Yields text chunks as they arrive.
    """
    settings = get_settings()

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    base_url = settings.gemini_base_url.rstrip("/")

    url = f"{base_url}/models/{model}:streamGenerateContent?key={settings.gemini_api_key}&alt=sse"

    messages = []
    
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    
    messages.append({"role": "user", "content": prompt})

    formatted_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        if role == "system":
            role = "user"
        
        if isinstance(msg.get("content"), str):
            formatted_messages.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })

    payload = {
        "contents": formatted_messages,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "topP": 0.95,
            "topK": 40,
        },
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            
            async for line in response.aiter_lines():
                if line.startswith("data:"):
                    data_str = line[5:].strip()
                    if data_str:
                        try:
                            data = json.loads(data_str)
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    if "text" in part:
                                        yield part["text"]
                        except json.JSONDecodeError:
                            pass