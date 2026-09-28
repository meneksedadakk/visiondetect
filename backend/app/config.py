"""Ortam degiskenlerinden okunan uygulama ayarlari."""

from pathlib import Path
from typing import Optional, Tuple

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend ayarlari.

    `VISIONGUARD_` on eki, ayarlari kodu degistirmeden ortam degiskenleriyle
    yonetmemizi saglar. Ornegin: `VISIONGUARD_MODEL_NAME=yolo11s.pt`.
    """

    app_name: str = "VisionGuard API"
    app_version: str = "0.1.0"
    model_name: str = "yolo11n.pt"
    model_path: Optional[Path] = None
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    max_image_pixels: int = Field(default=25_000_000, gt=0)
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="VISIONGUARD_",
        extra="ignore",
    )

    @property
    def model_source(self) -> str:
        """Yerel yol verilmisse onu, aksi halde pretrained model adini kullan."""

        return str(self.model_path) if self.model_path else self.model_name

    @property
    def allowed_origins(self) -> Tuple[str, ...]:
        """Virgulle ayrilmis CORS listesini temiz bir tuple'a cevir."""

        return tuple(
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        )
