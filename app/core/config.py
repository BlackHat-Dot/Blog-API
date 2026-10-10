from pydantic import ConfigDict, Field, PostgresDsn
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Blog API"
    api_v1_str: str = "/api/v1"
    secret_key: str = Field(..., validation_alias="SECRET_KEY")
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = Field(..., validation_alias="DATABASE_URL")
    allowed_origins: list[str] | str = ["*"]

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def get_allowed_origins(self) -> list[str]:
        raw_list = (
            [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
            if isinstance(self.allowed_origins, str)
            else list(self.allowed_origins)
        )
        cleaned = set()
        for origin in raw_list:
            if origin == "*":
                cleaned.add("*")
            else:
                # Remove trailing slash because browsers send Origin without trailing slash
                cleaned.add(origin.rstrip("/"))
        return list(cleaned)


settings = Settings()
