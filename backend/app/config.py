from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///../data/runtime/aguaia.db"
    checkpoint_path: str = "../data/runtime/checkpoints.db"
    coordinator_token: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://localhost:5173"]
    llm_provider: Literal["mock", "nvidia"] = "mock"
    nvidia_api_key: SecretStr = SecretStr("")
    nvidia_model: str = "deepseek-ai/deepseek-v4.1-flash"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_timeout_seconds: float = Field(default=10, gt=0, le=60)
    dedup_window_hours: int = Field(default=72, ge=48, le=168)
    rate_limit_per_minute: int = Field(default=30, ge=1)
    telegram_bot_token: SecretStr = SecretStr("")
    whatsapp_verify_token: SecretStr = SecretStr("")
    whatsapp_app_secret: SecretStr = SecretStr("")
    whatsapp_access_token: SecretStr = SecretStr("")
    whatsapp_phone_number_id: str = Field(default="", pattern=r"^\d*$")
    whatsapp_graph_version: str = Field(default="v23.0", pattern=r"^v\d+\.\d+$")
    media_path: str = "../data/runtime/media"
    media_max_bytes: int = Field(default=10 * 1024 * 1024, gt=0, le=20 * 1024 * 1024)

    def prepare_paths(self) -> None:
        if self.database_url.startswith("sqlite+aiosqlite:///"):
            business = Path(self.database_url.removeprefix("sqlite+aiosqlite:///"))
            if business.resolve() == Path(self.checkpoint_path).resolve():
                raise ValueError("Negocio y checkpoints requieren archivos distintos")
            business.parent.mkdir(parents=True, exist_ok=True)
        Path(self.checkpoint_path).parent.mkdir(parents=True, exist_ok=True)
