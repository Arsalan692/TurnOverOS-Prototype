from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://turnover:turnover@localhost:5433/turnoveros"
    gemini_api_key: str = ""
    # Tried in order; later ones are fallbacks when a model is busy
    gemini_models: str = "gemini-3.5-flash,gemini-2.5-flash"
    cors_origins: str = "http://localhost:5173"
    # Also allow the Vercel deployment and its preview URLs
    cors_origin_regex: str = r"https://[a-z0-9-]+\.vercel\.app"
    # Public demo: cap AI calls per visitor so the Gemini quota is not drained
    ai_calls_per_hour: int = 40

    model_config = SettingsConfigDict(env_file=".env")

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        """Neon/Render give postgres:// or postgresql:// URLs; SQLAlchemy needs the driver name."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v


settings = Settings()
