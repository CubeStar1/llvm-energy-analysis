from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ENERGY_ANALYZER_",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    clangxx: str = "clang++-18"
    llc: str = "llc-18"
    default_std: str = "c++20"
    default_optimization_flags: list[str] = Field(default_factory=lambda: ["-O2"])
    remarks_filename: str = "energy-remarks.yaml"
    llvm_pass_so: str = str(
        Path(__file__).resolve().parents[4] / "llvm-pass" / "build" / "EnergyPass.so"
    )
    energy_model_path: str = str(
        Path(__file__).resolve().parents[4]
        / "llvm-pass"
        / "models"
        / "x86_64-energy-model.json"
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:3001",
            "http://localhost:3001",
        ]
    )
    log_level: str = "INFO"

    @model_validator(mode="after")
    def resolve_paths(self) -> "Settings":
        repo_root = Path(__file__).resolve().parents[4]
        configured_path = Path(self.llvm_pass_so)
        if configured_path.exists():
            self.llvm_pass_so = str(configured_path)
        else:
            relative_to_repo = (repo_root / configured_path).resolve()
            self.llvm_pass_so = (
                str(relative_to_repo) if relative_to_repo.exists() else str(configured_path)
            )

        model_path = Path(self.energy_model_path)
        if model_path.exists():
            self.energy_model_path = str(model_path)
            return self

        relative_model_path = (repo_root / model_path).resolve()
        self.energy_model_path = (
            str(relative_model_path)
            if relative_model_path.exists()
            else str(model_path)
        )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
