from functools import lru_cache
from pathlib import Path

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

ENERGY_KEYWORDS: dict[str, tuple[float, list[str]]] = {
    "for": (3.6, ["CMP", "BR", "ADD"]),
    "while": (3.4, ["CMP", "BR"]),
    "if": (2.2, ["CMP", "BR"]),
    "vector": (2.8, ["VEC_FALLBACK"]),
    "float": (2.6, ["FP_FALLBACK"]),
    "double": (2.9, ["FP_FALLBACK"]),
    "new": (2.5, ["CALL", "STORE"]),
    "delete": (2.3, ["CALL"]),
    "return": (1.2, ["RET"]),
}


class AnalyzerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._compiler = CompilerService(settings)

    async def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
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
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            remarks_path = workspace / self._settings.remarks_filename
            remarks = parse_remarks_documents(remarks_path)

            functions = self._build_function_summaries(request.code)
            source_annotations = self._build_source_annotations(
                source_code=request.code,
                filename=request.filename,
            )
            summary = self._build_summary(functions, source_annotations)

            if not remarks:
                remarks = self._build_stub_remarks(
                    filename=request.filename,
                    used_stub=compiler_output.used_stub,
                    source_annotations=source_annotations,
                )

            return AnalyzeResponse(
                runId=workspace.name,
                llvmIr=compiler_output.llvm_ir,
                summary=summary,
                functions=functions,
                sourceAnnotations=source_annotations,
                remarks=remarks,
            )

    def _build_function_summaries(self, source_code: str) -> list[FunctionSummary]:
        total_raw_energy = 0.0
        block_count = 1
        for line in source_code.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue
            total_raw_energy += self._score_line(stripped)[0]
            if "{" in stripped:
                block_count += 1

        weighted_energy = round(total_raw_energy * 1.35, 3)
        return [
            FunctionSummary(
                name="main",
                weightedEnergy=weighted_energy,
                rawEnergy=round(total_raw_energy, 3),
                blockCount=block_count,
            )
        ]

    def _build_source_annotations(
        self,
        source_code: str,
        filename: str,
    ) -> list[SourceAnnotation]:
        annotations: list[SourceAnnotation] = []
        for index, line in enumerate(source_code.splitlines(), start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue

            score, opcodes = self._score_line(stripped)
            annotations.append(
                SourceAnnotation(
                    file=filename,
                    line=index,
                    weightedEnergy=round(score, 3),
                    instructionCount=max(1, len(opcodes)),
                    topOpcodes=opcodes,
                )
            )

        annotations.sort(key=lambda annotation: annotation.weightedEnergy, reverse=True)
        return annotations

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

    def _build_stub_remarks(
        self,
        filename: str,
        used_stub: bool,
        source_annotations: list[SourceAnnotation],
    ) -> list[Remark]:
        if not source_annotations:
            return []

        lead_annotation = source_annotations[0]
        message = (
            "Stub energy analysis generated from source heuristics because clang++ is not available."
            if used_stub
            else "LLVM IR compiled successfully; energy pass output is still stubbed until the WSL LLVM plugin is wired in."
        )
        return [
            Remark(
                kind="Analysis",
                pass_name="energy",
                function="main",
                message=message,
                file=filename,
                line=lead_annotation.line,
                column=lead_annotation.column,
                metadata={
                    "topOpcodes": lead_annotation.topOpcodes,
                    "weightedEnergy": lead_annotation.weightedEnergy,
                },
            )
        ]

    def _score_line(self, line: str) -> tuple[float, list[str]]:
        lowered = line.lower()
        energy = 1.0
        opcodes = ["ALU"]
        for keyword, (weight, keyword_opcodes) in ENERGY_KEYWORDS.items():
            if keyword in lowered:
                energy += weight
                opcodes = keyword_opcodes
        if "*" in line or "/" in line:
            energy += 1.6
            opcodes = ["MUL", "DIV"]
        if "[" in line and "]" in line:
            energy += 1.8
            opcodes = ["LOAD", "STORE"]
        return energy, opcodes


@lru_cache(maxsize=1)
def get_analyzer_service() -> AnalyzerService:
    return AnalyzerService(get_settings())
