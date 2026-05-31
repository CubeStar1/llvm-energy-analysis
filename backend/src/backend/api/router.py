from fastapi import APIRouter

from backend.api.routes.analyze import router as analyze_router
from backend.api.routes.report import router as report_router

api_router = APIRouter()
api_router.include_router(analyze_router)
api_router.include_router(report_router)
