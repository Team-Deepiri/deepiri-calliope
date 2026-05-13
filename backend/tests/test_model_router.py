from calliope.config import Settings
from calliope.providers.types import RouterProvider
from calliope.services.model_router import infer_provider_from_model, resolve_route


def test_infer_claude():
    assert infer_provider_from_model("claude-3-5-haiku-20241022") is RouterProvider.ANTHROPIC


def test_infer_gpt():
    assert infer_provider_from_model("gpt-4o-mini") is RouterProvider.OPENAI


def test_infer_openrouter_slash():
    assert infer_provider_from_model("anthropic/claude-3.5-sonnet") is RouterProvider.OPENROUTER


def test_infer_ollama_prefix():
    assert infer_provider_from_model("ollama/mistral") is RouterProvider.OLLAMA


def test_resolve_explicit_openai():
    s = Settings(
        openai_api_key="sk-test",
        default_llm_provider="ollama",
    )
    p, mid = resolve_route(s, provider=RouterProvider.OPENAI, model="gpt-4o")
    assert p is RouterProvider.OPENAI
    assert mid == "gpt-4o"


def test_resolve_auto_no_model_uses_default_provider():
    s = Settings(default_llm_provider="openai", openai_default_model="gpt-4o-mini")
    p, mid = resolve_route(s, provider=RouterProvider.AUTO, model=None)
    assert p is RouterProvider.OPENAI
    assert mid == "gpt-4o-mini"
