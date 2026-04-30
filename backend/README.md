# Backend

FastAPI orchestration service for the LLVM energy analyzer MVP.

## Why this shape

- `api/` keeps HTTP concerns small.
- `services/` owns orchestration and subprocess work.
- `parsers/` is isolated so LLVM/YAML normalization stays testable.
- `schemas/` defines the frontend contract in one place.

## Local development

```powershell
cd backend
uv sync
uv run uvicorn backend.main:app --app-dir src --reload
```

The service listens on `http://127.0.0.1:8000` by default.

Configure the LLVM toolchain in `backend/.env`. The backend loads that file automatically.

Example:

```bash
ENERGY_ANALYZER_CLANGXX=clang++-18
ENERGY_ANALYZER_LLC=llc-18
ENERGY_ANALYZER_LLVM_PASS_SO=/mnt/c/Users/avina/Projects/RVCE/2026/CD/llvm-pass/build/EnergyPass.so
ENERGY_ANALYZER_LOG_LEVEL=INFO
```

A starter file is included at `backend/.env.example`.

## Current behavior

- The backend expects a real local LLVM toolchain: `clang++`, `llc`, and the built `llvm-pass/build/EnergyPass.so`.
- `POST /analyze` compiles the submitted file to textual LLVM IR, lowers it to MIR, runs the `energy` pass, and returns real function-level energy data.
- Source-line annotations remain empty until the LLVM pass emits source-linked remarks or structured output.

## API

### `POST /analyze`

```json
{
  "code": "int main() { return 0; }",
  "filename": "main.cpp",
  "std": "c++20",
  "compilerFlags": ["-O2"]
}
```

The response matches the contract from `IMPLEMENTATION_PLAN.md` and always includes:

- `llvmIr`
- `summary`
- `functions`
- `sourceAnnotations`
- `remarks`
