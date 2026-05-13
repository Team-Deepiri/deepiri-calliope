from openai import AsyncOpenAI

from calliope.config import Settings


async def complete_chat(
    settings: Settings,
    *,
    model: str,
    system: str,
    user: str,
) -> str:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not set")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.7,
    )
    choice = resp.choices[0].message.content
    return choice or ""
