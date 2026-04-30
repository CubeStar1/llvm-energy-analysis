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

        return CompilerOutput(
            llvm_ir="define i32 @main() {\nentry:\n  ret i32 0\n}\n",
            compile_command=["clang++", "main.cpp"],
            energy_result=EnergyPassResult(
                functions={"main": 4.2},
                stderr="[energy] function=main weighted-energy=4.20\n",
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
    assert payload["functions"][0]["name"] == "main"
    assert payload["functions"][0]["weightedEnergy"] == 4.2
    assert payload["remarks"][0]["pass"] == "energy"
    assert payload["sourceAnnotations"] == []


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
