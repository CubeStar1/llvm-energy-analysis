import asyncio
from functools import lru_cache
import logging

from fastapi import HTTPException

from backend.parsers.clang_ast import ParsedAstNode
from backend.core.config import Settings, get_settings
from backend.parsers.energy import ParsedEnergyReport
from backend.parsers.remarks import parse_remarks_documents
from backend.schemas.analyze import (
    AnalyzeRequest,
    AnalyzeResponse,
    AstNode,
    BlockInstruction,
    CfgBlock,
    CfgEdge,
    CfgFunction,
    FunctionSummary,
    Remark,
    SourceAnnotation,
    Summary,
)
from backend.services.ast_dump import AstService
from backend.services.compiler import CompilerExecutionError, CompilerService
from backend.services.workspace import analysis_workspace

logger = logging.getLogger(__name__)


class AnalyzerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._compiler = CompilerService(settings)
        self._ast = AstService(settings)

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

            # The AST parse is independent of the compile+pass pipeline, so it
            # rides along for free instead of adding to the wall clock.
            compile_task = asyncio.create_task(
                self._compiler.emit_llvm_ir(
                    request=request,
                    workspace=workspace,
                    source_path=source_path,
                )
            )
            ast_task = asyncio.create_task(
                self._ast.build(source_path=source_path, std=request.std)
            )

            try:
                compiler_output = await compile_task
            except CompilerExecutionError as exc:
                ast_task.cancel()
                logger.exception("Analysis failed for %s", request.filename)
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            parsed_ast = await ast_task

            remarks_path = workspace / self._settings.remarks_filename
            remarks = parse_remarks_documents(remarks_path)

            functions = self._build_function_summaries(
                compiler_output.energy_result.report
            )
            source_annotations = self._build_source_annotations(
                compiler_output.energy_result.report
            )
            cfg = self._build_cfg(compiler_output.energy_result.report)
            ast = self._build_ast(parsed_ast, source_annotations)
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
                cfg=cfg,
                ast=ast,
            )

    def _build_cfg(self, report: ParsedEnergyReport) -> list[CfgFunction]:
        blocks_by_function: dict[str, list] = {}
        for block in report.blocks:
            blocks_by_function.setdefault(block.function, []).append(block)

        cfg_functions: list[CfgFunction] = []
        for function_name, blocks in blocks_by_function.items():
            blocks.sort(key=lambda item: item.number)
            loop_depths = {block.number: block.loop_depth for block in blocks}

            edges = [
                CfgEdge(
                    source=block.number,
                    target=successor,
                    # A back edge closes a loop: it jumps to an earlier block
                    # that is at least as deeply nested as the block it leaves.
                    isBackEdge=(
                        successor <= block.number
                        and loop_depths.get(successor, 0) >= block.loop_depth
                        and block.loop_depth > 0
                    ),
                )
                for block in blocks
                for successor in block.successors
                if successor in loop_depths
            ]

            cfg_functions.append(
                CfgFunction(
                    function=function_name,
                    weightedEnergy=round(
                        sum(block.weighted_energy for block in blocks), 3
                    ),
                    blocks=[
                        CfgBlock(
                            id=block.number,
                            name=block.display_name,
                            rawEnergy=round(block.raw_energy, 3),
                            weightedEnergy=round(block.weighted_energy, 3),
                            frequencyWeight=block.frequency_weight,
                            loopDepth=block.loop_depth,
                            isLoopHeader=block.is_loop_header,
                            isEntry=block.number == 0,
                            instructionCount=block.instruction_count,
                            mappedInstructionCount=block.mapped_instruction_count,
                            fallbackInstructionCount=block.fallback_instruction_count,
                            line=block.line,
                            endLine=block.end_line,
                            topOpcodes=block.top_opcodes,
                            instructions=[
                                BlockInstruction(
                                    opcode=instruction.opcode,
                                    bucket=instruction.bucket,
                                    cost=instruction.cost,
                                    line=instruction.line,
                                )
                                for instruction in block.instructions
                            ],
                            instructionsTruncated=block.instructions_truncated,
                        )
                        for block in blocks
                    ],
                    edges=edges,
                )
            )

        cfg_functions.sort(key=lambda item: item.weightedEnergy, reverse=True)
        return cfg_functions

    def _build_ast(
        self,
        parsed_ast: ParsedAstNode | None,
        source_annotations: list[SourceAnnotation],
    ) -> AstNode | None:
        if parsed_ast is None:
            return None

        energy_by_line: dict[int, float] = {}
        for annotation in source_annotations:
            energy_by_line[annotation.line] = (
                energy_by_line.get(annotation.line, 0.0) + annotation.weightedEnergy
            )

        def convert(node: ParsedAstNode) -> AstNode:
            children = [convert(child) for child in node.children]
            self_energy = energy_by_line.get(node.line, 0.0)
            # Sum over the node's source range rather than over its children:
            # instructions attributed to a line inside the range may belong to
            # no child node we kept.
            subtree_energy = sum(
                energy
                for line, energy in energy_by_line.items()
                if node.line <= line <= max(node.end_line, node.line)
            )
            return AstNode(
                id=node.id,
                kind=node.kind,
                label=node.label,
                detail=node.detail,
                line=node.line,
                column=node.column,
                endLine=node.end_line,
                selfEnergy=round(self_energy, 3),
                subtreeEnergy=round(subtree_energy, 3),
                truncated=node.truncated,
                children=children,
            )

        return convert(parsed_ast)

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
