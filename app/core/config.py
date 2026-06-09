from pydantic import ConfigDict, Field, PostgresDsn
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Blog API"
    api_v1_str: str = "/api/v1"
    secret_key: str = Field(..., env="SECRET_KEY")
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: PostgresDsn = Field(..., env="DATABASE_URL")
    allowed_origins: list[str] = ["*"]

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
