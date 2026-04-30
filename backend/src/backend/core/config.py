from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ENERGY_ANALYZER_",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    clangxx: str = "clang++"
    default_std: str = "c++20"
    default_optimization_flags: list[str] = Field(default_factory=lambda: ["-O2"])
    remarks_filename: str = "energy-remarks.yaml"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:3001",
            "http://localhost:3001",
        ]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
