import json

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.analyzer import get_analyzer_service
from backend.services.report import generate_html
from backend.schemas.analyze import AnalyzeRequest, AnalyzeResponse, Summary, FunctionSummary, SourceAnnotation, Remark

client = TestClient(app)

_FAKE_RESPONSE = AnalyzeResponse(
    runId="test-run-001",
    llvmIr="define i32 @main() {\nentry:\n  ret i32 0\n}\n",
    summary=Summary(
        totalRawEnergy=6.4,
        totalWeightedEnergy=8.8,
        hottestFunction="main",
        hottestLine=3,
    ),
    functions=[
        FunctionSummary(
            name="main",
            weightedEnergy=8.8,
            rawEnergy=6.4,
            blockCount=2,
            instructionCount=6,
            mappedInstructionCount=5,
            fallbackInstructionCount=1,
        )
    ],
    sourceAnnotations=[
        SourceAnnotation(
            file="test.cpp",
            line=3,
            column=3,
            rawEnergy=3.2,
            weightedEnergy=4.4,
            instructionCount=3,
            topOpcodes=["ADD64rr", "CMP64rr"],
        ),
        SourceAnnotation(
            file="test.cpp",
            line=4,
            column=3,
            rawEnergy=1.6,
            weightedEnergy=2.0,
            instructionCount=2,
            topOpcodes=["MOV64rm"],
        ),
    ],
    remarks=[
        Remark(
            kind="Analysis",
            pass_name="energy",
            function="main",
            message="function weighted energy = 8.80",
            file="test.cpp",
            line=1,
            column=1,
        )
    ],
)

_FAKE_REQUEST = AnalyzeRequest(
    code="int main() {\n  int x = 0;\n  x += 1;\n  return x;\n}\n",
    filename="test.cpp",
    std="c++20",
    compilerFlags=["-O2"],
)


def test_generate_html_returns_string() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert isinstance(result, str)


def test_generate_html_contains_doctype() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "<!DOCTYPE html>" in result


def test_generate_html_contains_filename() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "test.cpp" in result


def test_generate_html_contains_function_name() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "main" in result


def test_generate_html_contains_weighted_energy() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "8.8" in result or "8.80" in result


def test_generate_html_contains_source_lines() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "x += 1" in result or "x +=" in result


def test_generate_html_contains_line_numbers() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert ">3<" in result or ">3 <" in result or "3</td>" in result


def test_generate_html_contains_run_id() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "test-run-001" in result


def test_generate_html_heat_critical_class_for_top_line() -> None:
    result = generate_html(_FAKE_REQUEST, _FAKE_RESPONSE)
    assert "heat-critical" in result


def test_report_endpoint_returns_html_content_type() -> None:
    analyzer = get_analyzer_service()
    original_emit = analyzer._compiler.emit_llvm_ir

    async def fake_emit(*_args, **_kwargs):
        from backend.services.compiler import CompilerOutput, EnergyPassResult
        from backend.parsers.energy import (
            ParsedEnergyReport,
            ParsedFunctionEnergy,
            ParsedSourceAnnotation,
        )
        return CompilerOutput(
            llvm_ir="define i32 @main() {\nentry:\n  ret i32 0\n}\n",
            compile_command=[],
            energy_result=EnergyPassResult(
                report=ParsedEnergyReport(
                    functions=[
                        ParsedFunctionEnergy(
                            name="main",
                            raw_energy=3.0,
                            weighted_energy=3.0,
                            block_count=1,
                            instruction_count=3,
                            mapped_instruction_count=3,
                            fallback_instruction_count=0,
                        )
                    ],
                    source_annotations=[
                        ParsedSourceAnnotation(
                            function="main",
                            file="t.cpp",
                            line=1,
                            column=1,
                            raw_energy=3.0,
                            weighted_energy=3.0,
                            instruction_count=3,
                            top_opcodes=["RET64"],
                        )
                    ],
                ),
                stderr="",
                command=[],
            ),
        )

    analyzer._compiler.emit_llvm_ir = fake_emit
    response = client.post(
        "/report",
        json={
            "code": "int main() { return 0; }\n",
            "filename": "t.cpp",
            "std": "c++20",
            "compilerFlags": ["-O2"],
        },
    )
    analyzer._compiler.emit_llvm_ir = original_emit

    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "<!DOCTYPE html>" in response.text
    assert "main" in response.text


def test_report_endpoint_returns_400_on_compiler_error() -> None:
    analyzer = get_analyzer_service()
    original_emit = analyzer._compiler.emit_llvm_ir

    async def failing_emit(*_args, **_kwargs):
        from backend.services.compiler import CompilerExecutionError
        raise CompilerExecutionError("toolchain unavailable")

    analyzer._compiler.emit_llvm_ir = failing_emit
    response = client.post(
        "/report",
        json={"code": "int main(){}", "filename": "t.cpp"},
    )
    analyzer._compiler.emit_llvm_ir = original_emit

    assert response.status_code == 400
