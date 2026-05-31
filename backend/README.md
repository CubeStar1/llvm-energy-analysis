# Backend

FastAPI orchestration service for the LLVM energy analyzer.

## Structure

- `api/` — HTTP endpoints
- `services/` — orchestration and subprocess logic
- `parsers/` — LLVM output and YAML remarks parsing
- `schemas/` — shared request/response types

## Local development

Run from the repo root in WSL/Linux:

```bash
cd backend
cp .env.example .env   # first time only
uv sync
uv run backend
```

For hot reload during development:

```bash
uv run uvicorn backend.main:app --app-dir src --reload
```

Listens on `http://127.0.0.1:8000`.

## Configuration

Settings are read from `backend/.env`. A starter file is at `backend/.env.example`.

```
ENERGY_ANALYZER_CLANGXX=clang++-18
ENERGY_ANALYZER_LLC=llc-18
ENERGY_ANALYZER_LLVM_PASS_SO=../llvm-pass/build/EnergyPass.so
ENERGY_ANALYZER_LOG_LEVEL=INFO
```

Build the pass first if `EnergyPass.so` is missing:

```bash
./llvm-pass/scripts/build.sh
```

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

Response fields: `llvmIr`, `summary`, `functions`, `sourceAnnotations`, `remarks`.

### `GET /healthz`

Liveness check.
