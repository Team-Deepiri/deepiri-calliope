from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://calliope:calliope@localhost:5432/calliope"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    aamati_root: str = "/opt/Aamati/aamati_ml"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


def get_settings() -> Settings:
    return Settings()
