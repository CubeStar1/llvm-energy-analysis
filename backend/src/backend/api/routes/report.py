from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from backend.schemas.analyze import AnalyzeRequest
from backend.services.analyzer import AnalyzerService, get_analyzer_service
from backend.services.report import generate_html

router = APIRouter()


@router.post("/report", response_class=HTMLResponse)
async def generate_report(
    request: AnalyzeRequest,
    analyzer: AnalyzerService = Depends(get_analyzer_service),
) -> HTMLResponse:
    result = await analyzer.analyze(request)
    html = generate_html(request, result)
    return HTMLResponse(content=html)
