from fastapi.testclient import TestClient

from backend.main import app
from backend.services.analyzer import get_analyzer_service
from backend.services.compiler import CompilerExecutionError


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_returns_contract() -> None:
    analyzer = get_analyzer_service()
    original_emit = analyzer._compiler.emit_llvm_ir

    async def fake_emit_llvm_ir(*_args, **_kwargs):
        from backend.services.compiler import CompilerOutput, EnergyPassResult
        from backend.parsers.energy import (
            ParsedEnergyReport,
            ParsedFunctionEnergy,
            ParsedSourceAnnotation,
        )

        return CompilerOutput(
            llvm_ir="define i32 @main() {\nentry:\n  ret i32 0\n}\n",
            compile_command=["clang++", "main.cpp"],
            energy_result=EnergyPassResult(
                report=ParsedEnergyReport(
                    functions=[
                        ParsedFunctionEnergy(
                            name="main",
                            raw_energy=3.6,
                            weighted_energy=4.2,
                            block_count=2,
                            instruction_count=5,
                            mapped_instruction_count=4,
                            fallback_instruction_count=1,
                        )
                    ],
                    source_annotations=[
                        ParsedSourceAnnotation(
                            function="main",
                            file="main.cpp",
                            line=2,
                            column=3,
                            raw_energy=1.8,
                            weighted_energy=2.4,
                            instruction_count=2,
                            top_opcodes=["ADD64rr", "CMP64rr"],
                        )
                    ],
                ),
                stderr=(
                    '[energy] {"kind":"function","function":"main","rawEnergy":3.6,'
                    '"weightedEnergy":4.2,"blockCount":2,"instructionCount":5,'
                    '"mappedInstructionCount":4,"fallbackInstructionCount":1}\n'
                ),
                command=["llc", "-run-pass=energy"],
            ),
        )

    analyzer._compiler.emit_llvm_ir = fake_emit_llvm_ir
    response = client.post(
        "/analyze",
        json={
            "code": "int main() {\n  for (int i = 0; i < 4; ++i) {}\n  return 0;\n}\n",
            "filename": "main.cpp",
            "std": "c++20",
            "compilerFlags": ["-O2"],
        },
    )

    payload = response.json()

    analyzer._compiler.emit_llvm_ir = original_emit

    assert response.status_code == 200
    assert payload["runId"]
    assert "define i32 @main()" in payload["llvmIr"]
    assert payload["summary"]["hottestFunction"] == "main"
    assert payload["summary"]["hottestLine"] == 2
    assert payload["functions"][0]["name"] == "main"
    assert payload["functions"][0]["weightedEnergy"] == 4.2
    assert payload["functions"][0]["blockCount"] == 2
    assert payload["functions"][0]["instructionCount"] == 5
    assert payload["remarks"][0]["pass"] == "energy"
    assert payload["sourceAnnotations"][0]["line"] == 2
    assert payload["sourceAnnotations"][0]["topOpcodes"] == ["ADD64rr", "CMP64rr"]


def test_analyze_returns_400_on_missing_toolchain() -> None:
    analyzer = get_analyzer_service()
    original_emit = analyzer._compiler.emit_llvm_ir

    async def failing_emit_llvm_ir(*_args, **_kwargs):
        raise CompilerExecutionError("LLVM analysis toolchain is unavailable")

    analyzer._compiler.emit_llvm_ir = failing_emit_llvm_ir
    response = client.post(
        "/analyze",
        json={
            "code": "int main() { return 0; }\n",
            "filename": "main.cpp",
        },
    )
    analyzer._compiler.emit_llvm_ir = original_emit

    assert response.status_code == 400
    assert response.json()["detail"] == "LLVM analysis toolchain is unavailable"
