from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./data/aguaia.db"
    checkpoint_path: Path = Path("data/checkpoints.sqlite")
    coordinator_token: SecretStr = SecretStr("")
    llm_provider: Literal["mock", "nvidia"] = "mock"
    nvidia_api_key: SecretStr = SecretStr("")
    nvidia_model: str = "deepseek-ai/deepseek-v4.1-flash"
    cors_origins: list[str] = ["http://localhost:5173"]
    dedupe_window_hours: int = Field(default=72, ge=1, le=720)
    rate_limit_per_minute: int = Field(default=20, ge=1, le=1000)
