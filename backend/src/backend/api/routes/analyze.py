from fastapi import APIRouter, Depends

from backend.schemas.analyze import (
    AnalyzeRequest,
    AnalyzeResponse,
    EnergyModelResponse,
    HealthResponse,
)
from backend.services.analyzer import AnalyzerService, get_analyzer_service
from backend.services.energy_model import get_energy_model

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse, tags=["system"])
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/model", response_model=EnergyModelResponse, tags=["analysis"])
async def energy_model() -> EnergyModelResponse:
    return get_energy_model()


@router.post("/analyze", response_model=AnalyzeResponse, tags=["analysis"])
async def analyze(
    payload: AnalyzeRequest,
    analyzer: AnalyzerService = Depends(get_analyzer_service),
) -> AnalyzeResponse:
    return await analyzer.analyze(payload)
