from functools import lru_cache
import logging

from fastapi import HTTPException

from backend.core.config import Settings, get_settings
from backend.parsers.energy import ParsedEnergyReport
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
                compiler_output.energy_result.report
            )
            source_annotations = self._build_source_annotations(
                compiler_output.energy_result.report
            )
            summary = self._build_summary(functions, source_annotations)

            if not remarks:
                remarks = self._build_energy_remarks(
                    filename=request.filename,
                    report=compiler_output.energy_result.report,
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
        report: ParsedEnergyReport,
    ) -> list[FunctionSummary]:
        return sorted(
            [
                FunctionSummary(
                    name=function.name,
                    weightedEnergy=round(function.weighted_energy, 3),
                    rawEnergy=round(function.raw_energy, 3),
                    blockCount=function.block_count,
                    instructionCount=function.instruction_count,
                    mappedInstructionCount=function.mapped_instruction_count,
                    fallbackInstructionCount=function.fallback_instruction_count,
                )
                for function in report.functions
            ],
            key=lambda summary: summary.weightedEnergy,
            reverse=True,
        )

    def _build_source_annotations(
        self,
        report: ParsedEnergyReport,
    ) -> list[SourceAnnotation]:
        return [
            SourceAnnotation(
                file=annotation.file,
                line=annotation.line,
                column=annotation.column,
                rawEnergy=round(annotation.raw_energy, 3),
                weightedEnergy=round(annotation.weighted_energy, 3),
                instructionCount=annotation.instruction_count,
                topOpcodes=annotation.top_opcodes,
            )
            for annotation in report.source_annotations
        ]

    def _build_energy_remarks(
        self,
        filename: str,
        report: ParsedEnergyReport,
    ) -> list[Remark]:
        line_remarks = [
            Remark(
                kind="Analysis",
                pass_name="energy",
                function=annotation.function,
                message=(
                    f"line energy = {annotation.weighted_energy:.2f}"
                    f" from {annotation.instruction_count} instruction(s)"
                ),
                file=annotation.file or filename,
                line=annotation.line,
                column=annotation.column,
                metadata={
                    "rawEnergy": round(annotation.raw_energy, 3),
                    "weightedEnergy": round(annotation.weighted_energy, 3),
                    "instructionCount": annotation.instruction_count,
                    "topOpcodes": annotation.top_opcodes,
                },
            )
            for annotation in report.source_annotations[:25]
        ]
        function_remarks = [
            Remark(
                kind="Analysis",
                pass_name="energy",
                function=function.name,
                message=f"function weighted energy = {function.weighted_energy:.2f}",
                file=filename,
                metadata={
                    "rawEnergy": round(function.raw_energy, 3),
                    "weightedEnergy": round(function.weighted_energy, 3),
                    "blockCount": function.block_count,
                    "instructionCount": function.instruction_count,
                    "mappedInstructionCount": function.mapped_instruction_count,
                    "fallbackInstructionCount": function.fallback_instruction_count,
                },
            )
            for function in report.functions
        ]
        return line_remarks + function_remarks

    def _build_summary(
        self,
        functions: list[FunctionSummary],
        source_annotations: list[SourceAnnotation],
    ) -> Summary:
        hottest_annotation = source_annotations[0] if source_annotations else None
        hottest_function = functions[0].name if functions else None
        total_raw_energy = sum(item.rawEnergy for item in functions)
        total_weighted_energy = sum(item.weightedEnergy for item in functions)
        return Summary(
            totalRawEnergy=round(total_raw_energy, 3),
            totalWeightedEnergy=round(total_weighted_energy, 3),
            hottestFunction=hottest_function,
            hottestLine=hottest_annotation.line if hottest_annotation else None,
        )


@lru_cache(maxsize=1)
def get_analyzer_service() -> AnalyzerService:
    return AnalyzerService(get_settings())
