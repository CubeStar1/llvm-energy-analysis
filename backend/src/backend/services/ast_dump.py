import asyncio
import logging
from pathlib import Path

from backend.core.config import Settings
from backend.parsers.clang_ast import ParsedAstNode, parse_ast

logger = logging.getLogger(__name__)

# Preferred over the libclang binary bundled with the pip package: the system
# library resolves the same headers as the clang++ we compile with, so the AST
# matches the code we actually measure.
LIBCLANG_CANDIDATES = (
    "/usr/lib/llvm-18/lib/libclang.so.1",
    "/usr/lib/x86_64-linux-gnu/libclang-18.so.1",
    "/usr/lib/llvm-18/lib/libclang-18.so.18",
)


class AstService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _library_file(self) -> str | None:
        configured = self._settings.libclang_library
        if configured:
            return configured if Path(configured).exists() else None
        return next(
            (path for path in LIBCLANG_CANDIDATES if Path(path).exists()),
            None,
        )

    async def build(self, source_path: Path, std: str) -> ParsedAstNode | None:
        """Parse the AST off the event loop; None whenever clang can't help."""
        return await asyncio.to_thread(
            parse_ast,
            source_path,
            std,
            self._library_file(),
        )
