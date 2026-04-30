from fastapi import APIRouter, Depends

from backend.schemas.analyze import AnalyzeRequest, AnalyzeResponse, HealthResponse
from backend.services.analyzer import AnalyzerService, get_analyzer_service

router = APIRouter()


@router.get("/healthz", response_model=HealthResponse, tags=["system"])
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/analyze", response_model=AnalyzeResponse, tags=["analysis"])
async def analyze(
    payload: AnalyzeRequest,
    analyzer: AnalyzerService = Depends(get_analyzer_service),
) -> AnalyzeResponse:
    return await analyzer.analyze(payload)
