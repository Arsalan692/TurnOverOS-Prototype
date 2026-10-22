from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://turnover:turnover@localhost:5433/turnoveros"
    gemini_api_key: str = ""
    # Tried in order; later ones are fallbacks when a model is busy
    gemini_models: str = "gemini-3.5-flash,gemini-2.5-flash"
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
