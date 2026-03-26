from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Stickify API", alias="STICKIFY_APP_NAME")
    app_version: str = Field(default="0.2.0", alias="STICKIFY_APP_VERSION")
    max_image_bytes: int = Field(default=10_000_000, alias="STICKIFY_MAX_IMAGE_BYTES")
    fetch_timeout_ms: int = Field(default=10_000, alias="STICKIFY_FETCH_TIMEOUT_MS")
    model_dir: Path = Field(default=Path("backend/.cache/models/u2netp"), alias="STICKIFY_MODEL_DIR")
    model_name: str = Field(default="u2netp", alias="STICKIFY_MODEL_NAME")
    allow_private_remote_hosts: bool = Field(default=False, alias="STICKIFY_ALLOW_PRIVATE_REMOTE_HOSTS")
    cors_origins: str = Field(default="*", alias="STICKIFY_CORS_ORIGINS")
    rate_limit_per_minute: int = Field(default=30, alias="STICKIFY_RATE_LIMIT_PER_MINUTE")
    default_outline_px: int = Field(default=10, alias="STICKIFY_DEFAULT_OUTLINE_PX")
    default_size: int = Field(default=512, alias="STICKIFY_DEFAULT_SIZE")
    default_mask_threshold: int = Field(default=128, alias="STICKIFY_DEFAULT_MASK_THRESHOLD")
    default_smoothness: int = Field(default=2, alias="STICKIFY_DEFAULT_SMOOTHNESS")
    max_source_edge: int = Field(default=1024, alias="STICKIFY_MAX_SOURCE_EDGE")

    @field_validator(
        "max_image_bytes",
        "fetch_timeout_ms",
        "rate_limit_per_minute",
        "default_outline_px",
        "default_size",
        "default_mask_threshold",
        "default_smoothness",
        "max_source_edge",
    )
    @classmethod
    def validate_positive_int(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Configuration values must be positive integers.")
        return value

    @property
    def fetch_timeout_seconds(self) -> float:
        return self.fetch_timeout_ms / 1000

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
