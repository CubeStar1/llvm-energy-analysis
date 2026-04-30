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

## Current behavior

- If `clang++` is available on the current machine, the backend will compile the submitted file to textual LLVM IR.
- If `clang++` is not available, the backend returns stub LLVM IR so the frontend can still be exercised.
- Energy remarks are still stubbed until the WSL LLVM pass is built and invoked.

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
