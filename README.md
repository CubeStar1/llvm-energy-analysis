# LLVM Static Energy Estimation Pass

An out-of-tree LLVM `MachineFunctionPass` that statically estimates per-function energy cost from machine instructions, with source-level annotation and a web-based visualization frontend.

**Assignment 22 — Compiler Design, RVCE 2026**

---

## What it does

The tool accepts C/C++ source code and produces a ranked energy estimate for every function, basic block, and source line — without running the program or requiring hardware counters. It works entirely at compile time using LLVM's machine-level IR.

Energy is modelled as a weighted sum of machine instructions. Each instruction is classified into a bucket (integer ALU, load, store, branch, call, compare, FP/vector), and each bucket carries a relative cost derived from published per-instruction energy characterization data.

---

## Repository layout

```
llvm-pass/                   LLVM pass (C++17)
  src/EnergyAnalysisPass.cpp   MachineFunctionPass implementation
  src/EnergyModel.cpp          JSON energy model loader and classifier
  include/energy/              Public headers
  models/x86_64-energy-model.json  Instruction cost table
  test/fixtures/               Sample inputs shipped with the pass
  CMakeLists.txt               Out-of-tree CMake build

backend/                     FastAPI orchestration service (Python 3.12)
  src/backend/
    services/compiler.py       Drives clang++ and llc, loads the pass
    services/analyzer.py       Builds API response from pass output
    parsers/energy.py          Parses [energy] JSON lines from stderr
    parsers/remarks.py         Parses LLVM optimization-remarks YAML
    api/routes/analyze.py      POST /analyze endpoint
  tests/                       Pytest unit and integration tests

frontend/                    Next.js visualization dashboard (TypeScript)
  components/dashboard/        Monaco editor, heatmap, function table, IR view
  components/methodology/      Methodology explanation pages

scripts/
  build.sh                     Builds EnergyPass.so
  run.sh                       Starts backend and frontend

testcases/                   ≥5 labelled test programs
```

---

## Prerequisites

All commands run inside **WSL (Ubuntu 24.04)**. The LLVM pass uses Linux shared-library loading (`-load EnergyPass.so`); it does not build or run on Windows natively.

```bash
sudo apt update
sudo apt install -y \
  build-essential cmake ninja-build \
  clang-18 llvm-18 llvm-18-dev \
  zlib1g-dev libzstd-dev libedit-dev lld-18

# Python toolchain (backend)
pip install uv          # or: curl -Ls https://astral.sh/uv/install.sh | sh

# Node toolchain (frontend) – only needed for the UI
# Install Node 20+ via nvm or your distro's package manager
```

---

## Quick start

### 1. Build the LLVM pass

```bash
./scripts/build.sh
```

This configures and compiles `llvm-pass/` into `llvm-pass/build/EnergyPass.so`.

### 2. Run backend and frontend

```bash
./scripts/run.sh
```

The backend starts at `http://localhost:8000` and the frontend at `http://localhost:3000`.

Open `http://localhost:3000/analyze`, paste C/C++ code, click **Analyze**, and inspect the energy heatmap.

### 3. Run the pass directly (no UI)

```bash
export LLVM_DIR="$(llvm-config-18 --cmakedir)"

# Compile to LLVM IR
clang++-18 -g -O2 -S -emit-llvm testcases/03_memory_bound.cpp -o /tmp/test.ll

# Lower to Machine IR
llc-18 -O2 -stop-after=finalize-isel /tmp/test.ll -o /tmp/test.mir

# Run the energy pass
llc-18 -load llvm-pass/build/EnergyPass.so \
       -run-pass=energy \
       -energy-model=llvm-pass/models/x86_64-energy-model.json \
       /tmp/test.mir -o /dev/null 2>&1 | grep '^\[energy\]'
```

### 4. Run the backend tests

```bash
cd backend
uv run pytest tests/ -v
```

---

## Configuration

Backend settings are read from `backend/.env` (copy from `backend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `ENERGY_ANALYZER_CLANGXX` | `clang++-18` | C++ compiler binary |
| `ENERGY_ANALYZER_LLC` | `llc-18` | LLVM static compiler binary |
| `ENERGY_ANALYZER_LLVM_PASS_SO` | `llvm-pass/build/EnergyPass.so` | Path to built pass |
| `ENERGY_ANALYZER_LOG_LEVEL` | `INFO` | Backend log verbosity |

---

## API

**`POST /analyze`**

Request body:
```json
{
  "code": "int main() { return 0; }",
  "filename": "main.cpp",
  "std": "c++20",
  "compilerFlags": ["-O2"]
}
```

Response includes: `llvmIr`, `summary`, `functions[]`, `sourceAnnotations[]`, `remarks[]`.

**`GET /healthz`** — liveness check.
