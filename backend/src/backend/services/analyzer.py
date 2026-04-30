from functools import lru_cache
import logging

from fastapi import HTTPException

from backend.core.config import Settings, get_settings
from backend.parsers.remarks import parse_remarks_documents
from backend.schemas.analyze import (
    AnalyzeRequest,
    AnalyzeResponse,
    FunctionSummary,
    Remark,
    SourceAnnotation,
    Summary,
)
from backend.services.compiler import CompilerExecutionError, CompilerService
from backend.services.workspace import analysis_workspace

logger = logging.getLogger(__name__)


class AnalyzerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._compiler = CompilerService(settings)

    async def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        logger.info(
            "Starting analysis for %s with std=%s flags=%s",
            request.filename,
            request.std,
            request.compilerFlags,
        )
        with analysis_workspace() as workspace:
            source_path = workspace / request.filename
            source_path.write_text(request.code, encoding="utf-8")

            try:
                compiler_output = await self._compiler.emit_llvm_ir(
                    request=request,
                    workspace=workspace,
                    source_path=source_path,
                )
            except CompilerExecutionError as exc:
                logger.exception("Analysis failed for %s", request.filename)
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            remarks_path = workspace / self._settings.remarks_filename
            remarks = parse_remarks_documents(remarks_path)

            functions = self._build_function_summaries(
                compiler_output.energy_result.functions
            )
            source_annotations: list[SourceAnnotation] = []
            summary = self._build_summary(functions, source_annotations)

            if not remarks:
                remarks = self._build_energy_remarks(
                    filename=request.filename,
                    function_energies=compiler_output.energy_result.functions,
                )

            logger.info(
                "Completed analysis for %s: functions=%s remarks=%s",
                request.filename,
                len(functions),
                len(remarks),
            )
            return AnalyzeResponse(
                runId=workspace.name,
                llvmIr=compiler_output.llvm_ir,
                summary=summary,
                functions=functions,
                sourceAnnotations=source_annotations,
                remarks=remarks,
            )

    def _build_function_summaries(
        self,
        function_energies: dict[str, float],
    ) -> list[FunctionSummary]:
        return sorted(
            [
                FunctionSummary(
                    name=name,
                    weightedEnergy=round(weighted_energy, 3),
                    rawEnergy=round(weighted_energy, 3),
                    blockCount=0,
                )
                for name, weighted_energy in function_energies.items()
            ],
            key=lambda summary: summary.weightedEnergy,
            reverse=True,
        )

    def _build_energy_remarks(
        self,
        filename: str,
        function_energies: dict[str, float],
    ) -> list[Remark]:
        return [
            Remark(
                kind="Analysis",
                pass_name="energy",
                function=name,
                message=f"weighted energy = {weighted_energy:.2f}",
                file=filename,
                metadata={"weightedEnergy": round(weighted_energy, 3)},
            )
            for name, weighted_energy in sorted(
                function_energies.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ]

    def _build_summary(
        self,
        functions: list[FunctionSummary],
        source_annotations: list[SourceAnnotation],
    ) -> Summary:
        hottest_annotation = source_annotations[0] if source_annotations else None
        hottest_function = functions[0].name if functions else None
        total_weighted_energy = sum(item.weightedEnergy for item in functions)
        return Summary(
            totalWeightedEnergy=round(total_weighted_energy, 3),
            hottestFunction=hottest_function,
            hottestLine=hottest_annotation.line if hottest_annotation else None,
        )


@lru_cache(maxsize=1)
def get_analyzer_service() -> AnalyzerService:
    return AnalyzerService(get_settings())
