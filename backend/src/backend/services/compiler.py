import asyncio
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

from backend.core.config import Settings
from backend.parsers.energy import (
    ParsedEnergyReport,
    parse_energy_pass_output,
)
from backend.schemas.analyze import AnalyzeRequest

logger = logging.getLogger(__name__)


class CompilerExecutionError(RuntimeError):
    pass


@dataclass(slots=True)
class EnergyPassResult:
    report: ParsedEnergyReport
    stderr: str
    command: list[str]


@dataclass(slots=True)
class CompilerOutput:
    llvm_ir: str
    compile_command: list[str]
    energy_result: EnergyPassResult


class CompilerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._clangxx_path = shutil.which(settings.clangxx)
        self._llc_path = shutil.which(settings.llc)
        logger.info(
            "Compiler toolchain config: clangxx=%s resolved=%s, llc=%s resolved=%s, llvm_pass_so=%s exists=%s",
            settings.clangxx,
            self._clangxx_path,
            settings.llc,
            self._llc_path,
            settings.llvm_pass_so,
            Path(settings.llvm_pass_so).exists(),
        )

    def is_available(self) -> bool:
        return (
            self._clangxx_path is not None
            and self._llc_path is not None
            and Path(self._settings.llvm_pass_so).exists()
        )

    async def emit_llvm_ir(
        self,
        request: AnalyzeRequest,
        workspace: Path,
        source_path: Path,
    ) -> CompilerOutput:
        self._refresh_tool_paths()
        if not self.is_available():
            raise CompilerExecutionError(self._build_unavailable_message())

        output_path = workspace / "input.ll"
        compile_command = [
            self._clangxx_path,
            str(source_path),
            f"-std={request.std}",
            "-g",
            "-S",
            "-emit-llvm",
            "-o",
            str(output_path),
        ]
        compile_command.extend(
            request.compilerFlags or self._settings.default_optimization_flags
        )

        await self._run_command(compile_command)
        energy_result = await self._run_energy_pass(
            workspace=workspace,
            llvm_ir_path=output_path,
            optimization_flags=request.compilerFlags
            or self._settings.default_optimization_flags,
        )

        return CompilerOutput(
            llvm_ir=output_path.read_text(encoding="utf-8"),
            compile_command=compile_command,
            energy_result=energy_result,
        )

    async def _run_energy_pass(
        self,
        workspace: Path,
        llvm_ir_path: Path,
        optimization_flags: list[str],
    ) -> EnergyPassResult:
        mir_path = workspace / "input.mir"
        stop_after_command = [
            self._llc_path,
            *optimization_flags,
            "-stop-after=finalize-isel",
            str(llvm_ir_path),
            "-o",
            str(mir_path),
        ]
        await self._run_command(stop_after_command)

        run_pass_command = [
            self._llc_path,
            "-load",
            self._settings.llvm_pass_so,
            "-run-pass=energy",
            f"-energy-model={self._settings.energy_model_path}",
            str(mir_path),
            "-o",
            "/dev/null",
        ]
        stderr = await self._run_command(run_pass_command)
        return EnergyPassResult(
            report=parse_energy_pass_output(stderr),
            stderr=stderr,
            command=run_pass_command,
        )

    async def _run_command(self, command: list[str]) -> str:
        logger.info("Running command: %s", " ".join(command))
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await process.communicate()
        stderr_text = stderr.decode("utf-8", errors="replace")
        if process.returncode != 0:
            logger.error(
                "Command failed with exit code %s: %s\n%s",
                process.returncode,
                " ".join(command),
                stderr_text,
            )
            raise CompilerExecutionError(stderr_text)
        if stderr_text.strip():
            logger.info("Command stderr: %s", stderr_text.strip())
        return stderr_text

    def _refresh_tool_paths(self) -> None:
        self._clangxx_path = shutil.which(self._settings.clangxx)
        self._llc_path = shutil.which(self._settings.llc)

    def _build_unavailable_message(self) -> str:
        missing_parts: list[str] = []
        if self._clangxx_path is None:
            missing_parts.append(f"{self._settings.clangxx} not found on PATH")
        if self._llc_path is None:
            missing_parts.append(f"{self._settings.llc} not found on PATH")
        if not Path(self._settings.llvm_pass_so).exists():
            missing_parts.append(f"LLVM pass not found at {self._settings.llvm_pass_so}")

        message = "LLVM analysis toolchain is unavailable: " + ", ".join(missing_parts)
        logger.error(message)
        return message
