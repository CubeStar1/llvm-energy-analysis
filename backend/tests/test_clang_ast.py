from pathlib import Path

import pytest

from backend.core.config import Settings
from backend.parsers import clang_ast
from backend.parsers.clang_ast import ParsedAstNode, parse_ast
from backend.schemas.analyze import SourceAnnotation
from backend.services.analyzer import AnalyzerService
from backend.services.ast_dump import AstService


PROGRAM = """#include <vector>

int accumulate(const std::vector<int> &values) {
  int total = 0;
  for (int i = 0; i < 4; ++i) {
    total += values[i] * 2;
  }
  return total;
}
"""


def _library_file() -> str | None:
    return AstService(Settings())._library_file()


def _count(node: ParsedAstNode) -> int:
    return 1 + sum(_count(child) for child in node.children)


def _find(node: ParsedAstNode, kind: str) -> ParsedAstNode | None:
    if node.kind == kind:
        return node
    for child in node.children:
        found = _find(child, kind)
        if found is not None:
            return found
    return None


@pytest.fixture
def source(tmp_path: Path) -> Path:
    path = tmp_path / "main.cpp"
    path.write_text(PROGRAM, encoding="utf-8")
    return path


def test_parse_ast_keeps_only_the_analyzed_file(source: Path) -> None:
    root = parse_ast(source, "c++20", _library_file())
    assert root is not None

    # <vector> alone contributes tens of thousands of declarations; if header
    # pruning regressed, this count would explode.
    assert _count(root) < 60
    assert [child.kind for child in root.children] == ["FunctionDecl"]
    assert root.children[0].label == "accumulate"


def test_parse_ast_labels_operators_and_records_ranges(source: Path) -> None:
    root = parse_ast(source, "c++20", _library_file())
    assert root is not None

    for_stmt = _find(root, "ForStmt")
    assert for_stmt is not None
    assert for_stmt.line == 5
    assert for_stmt.end_line == 7

    condition = _find(for_stmt, "BinaryOperator")
    assert condition is not None
    assert condition.label == "<"

    assert _find(root, "UnaryOperator").label == "++"
    assert _find(root, "CompoundAssignmentOperator").label == "+="


def test_parse_ast_finds_the_operator_past_a_cast(tmp_path: Path) -> None:
    # The operator of `static_cast<long long>(i) * i` is `*`; a naive scan for
    # the first punctuation token returns the `<` opening the cast instead.
    path = tmp_path / "cast.cpp"
    path.write_text(
        "long long f(int i) { long long t = 0; t += static_cast<long long>(i) * i;"
        " return t; }\n",
        encoding="utf-8",
    )

    root = parse_ast(path, "c++20", _library_file())
    assert root is not None

    product = _find(root, "BinaryOperator")
    assert product is not None
    assert product.label == "*"


def test_parse_ast_splices_out_implicit_cast_wrappers(source: Path) -> None:
    # libclang reports implicit conversions as single-child UNEXPOSED_EXPR
    # nodes; left in, every operand becomes a chain of look-alike nodes.
    root = parse_ast(source, "c++20", _library_file())
    assert root is not None
    assert _find(root, "UnexposedExpr") is None

    condition = _find(root, "BinaryOperator")
    assert [child.kind for child in condition.children] == [
        "DeclRefExpr",
        "IntegerLiteral",
    ]


def test_parse_ast_degrades_to_none_when_clang_cannot_parse() -> None:
    # The energy analysis is still perfectly valid without an AST, so a failure
    # here must return None rather than raise.
    assert parse_ast(Path("/nonexistent/file.cpp"), "c++20", _library_file()) is None


def test_parse_ast_respects_the_node_budget(
    source: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(clang_ast, "MAX_NODES", 3)

    root = parse_ast(source, "c++20", _library_file())

    assert root is not None
    assert _count(root) <= 4  # the root itself is not drawn from the budget
    assert root.truncated or any(child.truncated for child in root.children)


def test_build_ast_annotates_nodes_with_line_energy() -> None:
    tree = ParsedAstNode(
        id="0",
        kind="TranslationUnitDecl",
        line=1,
        end_line=8,
        children=[
            ParsedAstNode(
                id="1",
                kind="ForStmt",
                line=5,
                end_line=7,
                children=[
                    ParsedAstNode(id="2", kind="CompoundAssignOperator", line=6, end_line=6)
                ],
            )
        ],
    )
    annotations = [
        SourceAnnotation(
            file="main.cpp", line=5, weightedEnergy=2.0, instructionCount=1
        ),
        SourceAnnotation(
            file="main.cpp", line=6, weightedEnergy=40.0, instructionCount=6
        ),
        SourceAnnotation(
            file="main.cpp", line=99, weightedEnergy=7.0, instructionCount=1
        ),
    ]

    ast = AnalyzerService(Settings())._build_ast(tree, annotations)

    assert ast is not None
    for_stmt = ast.children[0]
    assert for_stmt.selfEnergy == 2.0
    assert for_stmt.subtreeEnergy == 42.0  # lines 5..7, excluding the stray line 99

    body = for_stmt.children[0]
    assert body.selfEnergy == 40.0
    assert body.subtreeEnergy == 40.0


def test_build_ast_returns_none_without_a_tree() -> None:
    assert AnalyzerService(Settings())._build_ast(None, []) is None
