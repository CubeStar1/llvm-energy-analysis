import asyncio
import shutil
from dataclasses import dataclass
from pathlib import Path

from backend.core.config import Settings
from backend.schemas.analyze import AnalyzeRequest


class CompilerExecutionError(RuntimeError):
    pass


@dataclass(slots=True)
class CompilerOutput:
    llvm_ir: str
    command: list[str]
    used_stub: bool


class CompilerService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def is_available(self) -> bool:
        return shutil.which(self._settings.clangxx) is not None

    async def emit_llvm_ir(
        self,
        request: AnalyzeRequest,
        workspace: Path,
        source_path: Path,
    ) -> CompilerOutput:
        if not self.is_available():
            return CompilerOutput(
                llvm_ir=self._build_stub_ir(request.code),
                command=[],
                used_stub=True,
            )

        output_path = workspace / "input.ll"
        command = [
            self._settings.clangxx,
            str(source_path),
            f"-std={request.std}",
            "-g",
            "-S",
            "-emit-llvm",
            "-o",
            str(output_path),
        ]
        command.extend(request.compilerFlags or self._settings.default_optimization_flags)

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise CompilerExecutionError(stderr.decode("utf-8", errors="replace"))

        return CompilerOutput(
            llvm_ir=output_path.read_text(encoding="utf-8"),
            command=command,
            used_stub=False,
        )

    @staticmethod
    def _build_stub_ir(source_code: str) -> str:
        commented_source = "\n".join(f"; {line}" for line in source_code.splitlines())
        return "\n".join(
            [
                "; Stub LLVM IR generated because clang++ is unavailable on this machine.",
                commented_source,
                "",
                "define i32 @main() {",
                "entry:",
                "  ret i32 0",
                "}",
                "",
            ]
        )
