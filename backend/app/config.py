"""Application configuration.

Values can be overridden with environment variables (see .env.example).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "sqlite:///./signal_clone.db"

    # Auth (mocked). The OTP is fixed for every phone/username in this demo.
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30
    mock_otp: str = "123456"

    # CORS — the Next.js dev server / deployed frontend origin.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Uploads
    upload_dir: str = "./uploads"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
