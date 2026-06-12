from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://calliope:calliope@localhost:5432/calliope"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    aamati_root: str = "/opt/Aamati/aamati_ml"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    audio_storage_path: Path = Path("/data/audio")
    recordings_path: Path = Path("/data/audio/recordings")
    processed_path: Path = Path("/data/audio/processed")
    exports_path: Path = Path("/data/audio/exports")
    samples_path: Path = Path("/data/audio/samples")

    max_upload_size_mb: int = 100
    supported_audio_formats: list[str] = ["wav", "mp3", "ogg", "flac", "m4a", "aac"]
    default_sample_rate: int = 48000
    default_bit_depth: int = 24

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    openrouter_api_key: str | None = None
    gemini_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    openai_default_model: str = "gpt-4o-mini"
    anthropic_default_model: str = "claude-3-5-haiku-20241022"
    openrouter_default_model: str = "meta-llama/llama-3.1-8b-instruct"
    gemini_default_model: str = "gemini-2.0-flash"
    default_llm_provider: str = "ollama"

    def provider_key_configured(self, name: str) -> bool:
        return {
            "openai": bool(self.openai_api_key),
            "anthropic": bool(self.anthropic_api_key),
            "openrouter": bool(self.openrouter_api_key),
            "gemini": bool(self.gemini_api_key),
            "ollama": True,
        }.get(name.lower(), False)

    def ensure_directories(self) -> None:
        for path in [self.recordings_path, self.processed_path, self.exports_path, self.samples_path]:
            path.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
