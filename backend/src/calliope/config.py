from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://calliope:calliope@localhost:5432/calliope"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    aamati_root: str = "/opt/Aamati/aamati_ml"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    openai_default_model: str = "gpt-4o-mini"
    anthropic_default_model: str = "claude-3-5-haiku-20241022"
    openrouter_default_model: str = "meta-llama/llama-3.1-8b-instruct"
    default_llm_provider: str = "ollama"

    def provider_key_configured(self, name: str) -> bool:
        return {
            "openai": bool(self.openai_api_key),
            "anthropic": bool(self.anthropic_api_key),
            "openrouter": bool(self.openrouter_api_key),
            "ollama": True,
        }.get(name.lower(), False)


def get_settings() -> Settings:
    return Settings()
