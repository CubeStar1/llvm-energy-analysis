# LLVM Static Energy Estimation Pass

An out-of-tree LLVM `MachineFunctionPass` that estimates relative per-function energy cost from machine instructions, exposed through a FastAPI backend and a Next.js dashboard.

**Assignment 22 — Compiler Design, RVCE 2026**

---

## What It Does

Accepts C/C++ source and estimates static energy cost without running the program:

1. Compiles with `clang++` to LLVM IR
2. Lowers to Machine IR with `llc`
3. The custom `energy` pass classifies instructions into cost buckets (ALU, load/store, branch, FP/vector, etc.)
4. Returns function-level, block-level, and source-annotated results

Energy values are relative estimates for comparing hot functions, not physical joule measurements.

---

## Prerequisites

<details>
<summary><strong>Windows (WSL)</strong></summary>

The LLVM pass and backend must run in WSL (Ubuntu 24.04 recommended). The frontend can run on Windows or in WSL.

> **Note:** Never build or run the LLVM pass in native PowerShell. `EnergyPass.so` is a Linux shared object loaded by Linux `llc`.

**LLVM + build tools** (inside WSL):

```bash
sudo apt update && sudo apt install -y \
  build-essential cmake ninja-build \
  clang-18 llvm-18 llvm-18-dev lld-18 \
  zlib1g-dev libzstd-dev libedit-dev libcurl4-openssl-dev
```

**uv** (Python package manager, inside WSL):

```bash
sudo apt install -y python3-pip
pip install uv
```

**Node.js 20+** — install on Windows (the frontend does not need LLVM): [nodejs.org](https://nodejs.org)

</details>

<details>
<summary><strong>Linux</strong></summary>

**LLVM + build tools:**

```bash
sudo apt update && sudo apt install -y \
  build-essential cmake ninja-build \
  clang-18 llvm-18 llvm-18-dev lld-18 \
  zlib1g-dev libzstd-dev libedit-dev libcurl4-openssl-dev
```

**uv** (Python package manager):

```bash
sudo apt install -y python3-pip
pip install uv
```

**Node.js 20+:**

```bash
sudo apt install -y nodejs npm
```

</details>

---

## Quick Start

### Linux / WSL

```bash
./scripts/build.sh   # builds llvm-pass/build/EnergyPass.so
./scripts/run.sh     # starts backend :8000 and frontend :3000
```

Open `http://localhost:3000/analyze`. Stop with `Ctrl+C`.

---

## Just want to run the pass?

If you only care about the LLVM pass and don't need the backend or frontend, build the pass and run it over all testcases in two commands:

```bash
./llvm-pass/scripts/build.sh
./scripts/run-tests.sh
```

This compiles every file in `testcases/`, runs the energy pass over each one, and prints the `[energy]` JSON output per function. No Python, no Node.

To run the pass on a single file:

```bash
./llvm-pass/scripts/run-pass.sh testcases/03_memory_bound.cpp
```

---

## Contributing

For development or debugging, run each service manually.

<details>
<summary><strong>1. Build the LLVM pass</strong></summary>

Run from the repo root in WSL/Linux:

```bash
./scripts/build.sh
```

If the repo is on a Windows drive, open WSL and find the path first:

```powershell
wsl wslpath -a "$PWD"
```

Output: `llvm-pass/build/EnergyPass.so`

</details>

<details>
<summary><strong>2. Run the pass on a file</strong></summary>

```bash
./llvm-pass/scripts/run-pass.sh testcases/03_memory_bound.cpp
```

Prints `[energy]` JSON records for each function — the same records the backend parser consumes. Omit the argument to use the default testcase.

</details>

<details>
<summary><strong>3. Start the backend</strong></summary>

The backend calls `clang++-18`, `llc-18`, and loads `EnergyPass.so`, so it must run in Linux or WSL.

<details>
<summary>Linux</summary>

```bash
cd backend
cp .env.example .env   # first time only
uv sync
uv run backend
```

</details>

<details>
<summary>Windows (WSL)</summary>

Open a WSL shell at the repo root, then:

```bash
cd backend
cp .env.example .env   # first time only
uv sync
uv run backend
```

</details>

Listens on `http://127.0.0.1:8000`. Check health:

```bash
curl http://127.0.0.1:8000/healthz
```

Edit `backend/.env` to change tool paths:

```
ENERGY_ANALYZER_CLANGXX=clang++-18
ENERGY_ANALYZER_LLC=llc-18
ENERGY_ANALYZER_LLVM_PASS_SO=../llvm-pass/build/EnergyPass.so
ENERGY_ANALYZER_LOG_LEVEL=INFO
```

</details>

<details>
<summary><strong>4. Start the frontend</strong></summary>

Works from Windows PowerShell or any shell with Node 20+:

```bash
cd frontend
npm install
npm run dev
```

Listens on `http://localhost:3000`. To point at a non-default backend, create `frontend/.env.local`:

```
NEXT_PUBLIC_ANALYZER_API_BASE_URL=http://127.0.0.1:8000
```

</details>

<details>
<summary><strong>Tests</strong></summary>

```bash
# Backend
cd backend && uv run pytest tests/ -v

# Frontend
cd frontend && npm run lint
```

</details>

---

## Troubleshooting

<details>
<summary><strong><code>EnergyPass.so not found</code></strong></summary>

Build the pass first:

```bash
./scripts/build.sh
```

Or on Windows:

```powershell
.\scripts\build.ps1
```

</details>

<details>
<summary><strong><code>llvm-config not found</code></strong></summary>

Install the LLVM dev packages in WSL/Linux:

```bash
sudo apt install -y llvm-18 llvm-18-dev clang-18
```

</details>

<details>
<summary><strong>CMake path mismatch (Windows ↔ WSL)</strong></summary>

Delete the build directory and rebuild from WSL:

```bash
rm -rf llvm-pass/build
./scripts/build.sh
```

</details>

<details>
<summary><strong>Analysis fails</strong></summary>

Confirm all tools are reachable from WSL:

```bash
which clang++-18 && which llc-18 && test -f llvm-pass/build/EnergyPass.so && echo ok
```

Also check `backend/.env` if you customized paths.

</details>

<details>
<summary><strong>Frontend can't reach backend</strong></summary>

Check the backend is healthy:

```bash
curl http://127.0.0.1:8000/healthz
```

If the backend is on another host or port, set `NEXT_PUBLIC_ANALYZER_API_BASE_URL` in `frontend/.env.local`.

</details>

---

## API Reference

### `GET /healthz`
Liveness check.

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

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"code":"int main(){return 0;}","filename":"main.cpp","std":"c++20","compilerFlags":["-O2"]}'
```

---

## Backend Configuration

Settings from `backend/.env` with the `ENERGY_ANALYZER_` prefix:

| Variable | Default | Description |
| --- | --- | --- |
| `ENERGY_ANALYZER_HOST` | `127.0.0.1` | Bind host |
| `ENERGY_ANALYZER_PORT` | `8000` | Port |
| `ENERGY_ANALYZER_CLANGXX` | `clang++-18` | C++ compiler |
| `ENERGY_ANALYZER_LLC` | `llc-18` | LLVM static compiler |
| `ENERGY_ANALYZER_DEFAULT_STD` | `c++20` | Default C++ standard |
| `ENERGY_ANALYZER_LLVM_PASS_SO` | `llvm-pass/build/EnergyPass.so` | Pass shared object path |
| `ENERGY_ANALYZER_ENERGY_MODEL_PATH` | `llvm-pass/models/x86_64-energy-model.json` | Energy model JSON |
| `ENERGY_ANALYZER_LOG_LEVEL` | `INFO` | Log verbosity |

---

## Repository Layout

```text
llvm-pass/                          LLVM pass (C++17)
  src/EnergyAnalysisPass.cpp        MachineFunctionPass implementation
  src/EnergyModel.cpp               JSON energy model loader and classifier
  include/energy/                   Public headers
  models/x86_64-energy-model.json   Default instruction cost table
  models/aarch64-energy-model.json  Alternative cost table
  scripts/run-pass.sh               Compile a .cpp file and run the pass on it
  test/fixtures/                    Sample inputs for pass development
  CMakeLists.txt                    Out-of-tree CMake build

backend/                            FastAPI orchestration service (Python 3.12)
  src/backend/services/compiler.py  Drives clang++ and llc, loads the pass
  src/backend/services/analyzer.py  Builds API responses
  src/backend/parsers/energy.py     Parses [energy] JSON lines from stderr
  src/backend/parsers/remarks.py    Parses LLVM optimization remarks YAML
  src/backend/api/routes/           HTTP endpoints
  tests/                            Pytest tests

frontend/                           Next.js dashboard (TypeScript)
  app/(analyze)/analyze/page.tsx    Analyzer page
  components/dashboard/             Editor, heatmap, tables, IR panel
  components/methodology/           Methodology pages
  lib/api.ts                        Backend API client

scripts/
  build.sh / run.sh                 Linux/WSL build and start

testcases/                          Labelled sample C++ programs
research/                           Methodology notes and source papers
```
