from fastapi.testclient import TestClient

from backend.main import app
from backend.services.analyzer import get_analyzer_service
from backend.services.compiler import CompilerExecutionError


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_model_endpoint_serves_the_configured_cost_table() -> None:
    response = client.get("/model")
    payload = response.json()

    assert response.status_code == 200
    assert payload["target"] == "x86_64"
    assert payload["aliasCount"] >= 70

    buckets = {bucket["name"]: bucket for bucket in payload["buckets"]}
    assert buckets["integer_alu"]["cost"] == 1.0  # the baseline unit
    assert buckets["load"]["cost"] > buckets["integer_alu"]["cost"]
    assert buckets["integer_alu"]["exampleOpcodes"]

    # Cheapest first, so the UI table reads as a ramp.
    costs = [bucket["cost"] for bucket in payload["buckets"]]
    assert costs == sorted(costs)


def test_analyze_returns_contract() -> None:
    analyzer = get_analyzer_service()
    original_emit = analyzer._compiler.emit_llvm_ir

    async def fake_emit_llvm_ir(*_args, **_kwargs):
        from backend.services.compiler import CompilerOutput, EnergyPassResult
        from backend.parsers.energy import (
            ParsedBlockEnergy,
            ParsedEnergyReport,
            ParsedFunctionEnergy,
            ParsedSourceAnnotation,
        )

        return CompilerOutput(
            llvm_ir="define i32 @main() {\nentry:\n  ret i32 0\n}\n",
            compile_command=["clang++", "main.cpp"],
            energy_result=EnergyPassResult(
                report=ParsedEnergyReport(
                    blocks=[
                        ParsedBlockEnergy(
                            function="main",
                            number=0,
                            name="",
                            raw_energy=1.8,
                            weighted_energy=1.8,
                            frequency_weight=1.0,
                            loop_depth=0,
                            is_loop_header=False,
                            instruction_count=2,
                            mapped_instruction_count=2,
                            fallback_instruction_count=0,
                            file="main.cpp",
                            line=2,
                            end_line=2,
                            successors=[1],
                        ),
                        ParsedBlockEnergy(
                            function="main",
                            number=1,
                            name="",
                            raw_energy=1.8,
                            weighted_energy=18.0,
                            frequency_weight=10.0,
                            loop_depth=1,
                            is_loop_header=True,
                            instruction_count=3,
                            mapped_instruction_count=2,
                            fallback_instruction_count=1,
                            file="main.cpp",
                            line=2,
                            end_line=2,
                            successors=[1],
                        ),
                    ],
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

    cfg = payload["cfg"][0]
    assert cfg["function"] == "main"
    assert [block["name"] for block in cfg["blocks"]] == ["%bb.0", "%bb.1"]
    assert cfg["blocks"][1]["isLoopHeader"] is True
    assert cfg["blocks"][1]["frequencyWeight"] == 10.0
    assert {"source": 1, "target": 1, "isBackEdge": True} in cfg["edges"]
    assert {"source": 0, "target": 1, "isBackEdge": False} in cfg["edges"]

    # The AST comes from the real clang, which the test environment may lack;
    # either way the analysis must succeed.
    if payload["ast"] is not None:
        assert payload["ast"]["kind"] == "TranslationUnitDecl"
        assert payload["ast"]["children"][0]["label"] == "main"


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
