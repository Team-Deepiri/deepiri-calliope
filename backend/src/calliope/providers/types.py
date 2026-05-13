from enum import StrEnum


class RouterProvider(StrEnum):
    """Which backend fulfills a completion. AUTO picks from model id heuristics."""

    AUTO = "auto"
    OLLAMA = "ollama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OPENROUTER = "openrouter"
