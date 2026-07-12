"""Build a compact, display-oriented AST from clang.

Uses libclang's lazy cursor traversal rather than ``clang -ast-dump=json``: the
JSON dump of a program that includes ``<vector>`` is ~100 MB, essentially all of
it standard-library declarations we would throw away. Walking cursors lets us
prune at the header boundary instead, so we only pay for the user's own code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Guards against a pathological program producing an unrenderable graph.
MAX_NODES = 1500
MAX_DEPTH = 40

# libclang leaves the spelling of literals blank, so we read it from the tokens.
_LITERAL_KINDS = frozenset(
    {
        "INTEGER_LITERAL",
        "FLOATING_LITERAL",
        "CHARACTER_LITERAL",
        "STRING_LITERAL",
        "CXX_BOOL_LITERAL_EXPR",
    }
)

_BINARY_KINDS = frozenset({"BINARY_OPERATOR", "COMPOUND_ASSIGNMENT_OPERATOR"})


@dataclass(slots=True)
class ParsedAstNode:
    id: str
    kind: str
    label: str = ""
    detail: str = ""
    line: int = 0
    column: int = 0
    end_line: int = 0
    truncated: bool = False
    children: list["ParsedAstNode"] = field(default_factory=list)


class _Budget:
    def __init__(self, max_nodes: int) -> None:
        self.remaining = max_nodes

    def take(self) -> bool:
        if self.remaining <= 0:
            return False
        self.remaining -= 1
        return True


def parse_ast(
    source_path: Path,
    std: str = "c++20",
    library_file: str | None = None,
) -> ParsedAstNode | None:
    """Parse ``source_path`` and return its AST, or None if clang is unusable.

    The AST is a convenience surface: a program that fails to parse still has a
    perfectly good energy analysis, so every failure here degrades to None.
    """
    try:
        from clang import cindex
    except ImportError:
        logger.warning("libclang bindings are unavailable; skipping AST")
        return None

    try:
        if library_file and not cindex.Config.loaded:
            cindex.Config.set_library_file(library_file)
        index = cindex.Index.create()
        unit = index.parse(str(source_path), args=[f"-std={std}"])
    except Exception:  # cindex surfaces load/parse failures as several types
        logger.exception("Failed to parse the AST for %s", source_path)
        return None

    return build_tree(unit.cursor, source_path)


def build_tree(root_cursor: object, source_path: Path) -> ParsedAstNode:
    """Walk cursors under the translation unit, keeping only the user's file."""
    budget = _Budget(MAX_NODES)
    root = ParsedAstNode(
        id="0",
        kind="TranslationUnitDecl",
        label=source_path.name,
    )
    counter = _IdCounter()
    source_path = source_path.resolve()

    for child in _children_in_file(root_cursor, source_path):
        if not budget.take():
            root.truncated = True
            break
        root.children.append(_convert(child, source_path, budget, counter, depth=1))

    if root.children:
        root.line = min((node.line for node in root.children if node.line), default=0)
        root.end_line = max(node.end_line for node in root.children)
    return root


class _IdCounter:
    def __init__(self) -> None:
        self._next = 0

    def take(self) -> str:
        self._next += 1
        return str(self._next)


def _convert(
    cursor: object,
    source_path: Path,
    budget: _Budget,
    counter: _IdCounter,
    depth: int,
) -> ParsedAstNode:
    extent = cursor.extent  # type: ignore[attr-defined]
    node = ParsedAstNode(
        id=counter.take(),
        kind=_kind_name(cursor),
        label=_label(cursor),
        detail=_detail(cursor),
        line=extent.start.line,
        column=extent.start.column,
        end_line=max(extent.end.line, extent.start.line),
    )

    if depth >= MAX_DEPTH:
        node.truncated = True
        return node

    for child in _children_in_file(cursor, source_path):
        if not budget.take():
            node.truncated = True
            break
        node.children.append(_convert(child, source_path, budget, counter, depth + 1))

    return node


def _children_in_file(cursor: object, source_path: Path):
    """Children declared in the analyzed file — the header-pruning step.

    Everything libclang reports from a header (all of <vector>, say) is dropped
    here, which is what keeps the tree to the user's own code.
    """
    for child in cursor.get_children():  # type: ignore[attr-defined]
        location_file = child.location.file
        if location_file is None:
            continue
        try:
            if Path(location_file.name).resolve() != source_path:
                continue
        except OSError:
            continue
        yield _skip_pass_through(child)


def _skip_pass_through(cursor: object):
    """Splice out UNEXPOSED_EXPR wrappers.

    libclang has no cursor kind for implicit conversions, so an ImplicitCastExpr
    surfaces as an UNEXPOSED_EXPR with a single child. Left in, every operand
    becomes a chain of two or three identical-looking nodes. They carry no
    information the child does not, so we hoist the child in their place.
    """
    while cursor.kind.name == "UNEXPOSED_EXPR":  # type: ignore[attr-defined]
        children = list(cursor.get_children())  # type: ignore[attr-defined]
        if len(children) != 1:
            return cursor
        cursor = children[0]
    return cursor


def _kind_name(cursor: object) -> str:
    # libclang spells kinds as FUNCTION_DECL; clang's own dumps say FunctionDecl.
    raw = cursor.kind.name  # type: ignore[attr-defined]
    return "".join(part.capitalize() for part in raw.split("_"))


def _label(cursor: object) -> str:
    spelling = cursor.spelling or ""  # type: ignore[attr-defined]
    if spelling:
        return spelling

    raw_kind = cursor.kind.name  # type: ignore[attr-defined]

    if raw_kind in _LITERAL_KINDS:
        return next(
            (token.spelling for token in cursor.get_tokens()),  # type: ignore[attr-defined]
            "",
        )

    if raw_kind in _BINARY_KINDS:
        return _binary_operator_token(cursor)

    if raw_kind == "UNARY_OPERATOR":
        return _unary_operator_token(cursor)

    return ""


def _binary_operator_token(cursor: object) -> str:
    """The operator of `a OP b`, found by offset rather than by shape.

    libclang 18 exposes no operator accessor, and picking the first punctuation
    token is wrong: in `static_cast<long long>(i) * i` that finds the `<` of the
    cast. The operator is the first token that starts after the left operand
    ends, so use the left child's extent to locate it.
    """
    children = list(cursor.get_children())  # type: ignore[attr-defined]
    if len(children) < 2:
        return ""

    left_end = children[0].extent.end.offset
    right_start = children[1].extent.start.offset
    for token in cursor.get_tokens():  # type: ignore[attr-defined]
        start = token.extent.start.offset
        if left_end <= start < right_start:
            return token.spelling
    return ""


def _unary_operator_token(cursor: object) -> str:
    tokens = list(cursor.get_tokens())  # type: ignore[attr-defined]
    if not tokens:
        return ""

    children = list(cursor.get_children())  # type: ignore[attr-defined]
    if not children:
        return tokens[0].spelling

    # Prefix (++i) vs postfix (i++): the operand tells us which side we are on.
    operand_start = children[0].extent.start.offset
    if tokens[0].extent.start.offset < operand_start:
        return tokens[0].spelling
    return tokens[-1].spelling


def _detail(cursor: object) -> str:
    try:
        return cursor.type.spelling or ""  # type: ignore[attr-defined]
    except Exception:
        return ""
