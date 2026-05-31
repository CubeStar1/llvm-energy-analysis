# LLVM Static Energy Estimation Pass

An out-of-tree LLVM `MachineFunctionPass` that estimates relative per-function
energy cost from machine instructions, then exposes the results through a
FastAPI backend and a Next.js visualization dashboard.

**Assignment 22 - Compiler Design, RVCE 2026**

---

## What This Project Does

This tool accepts C/C++ source code and estimates energy cost without running
the program or collecting hardware counters. The analysis happens at compile
time:

1. The backend compiles submitted C/C++ code to LLVM IR with `clang++`.
2. LLVM lowers the IR to Machine IR with `llc`.
3. The custom `energy` LLVM pass runs over machine instructions.
4. Instructions are grouped into coarse cost buckets such as integer ALU, load,
   store, branch, call, compare, and floating-point/vector work.
5. The backend parses the pass output and returns function-level, block-level,
   and source-level analysis data to the frontend.

The energy numbers are relative estimates, not physical joule measurements.
They are intended for comparing hot functions and understanding how instruction
mix affects static energy cost.

---

## Repository Layout

```text
llvm-pass/                         LLVM pass, C++17
  src/EnergyAnalysisPass.cpp       MachineFunctionPass implementation
  src/EnergyModel.cpp              JSON energy model loader and classifier
  include/energy/                  Public headers
  models/x86_64-energy-model.json  Default instruction cost table
  models/aarch64-energy-model.json Alternative cost table
  test/fixtures/                   Sample inputs for pass development
  CMakeLists.txt                   Out-of-tree CMake build

backend/                           FastAPI orchestration service, Python 3.12
  src/backend/services/compiler.py Drives clang++ and llc, loads the pass
  src/backend/services/analyzer.py Builds API responses
  src/backend/parsers/energy.py    Parses [energy] JSON lines from stderr
  src/backend/parsers/remarks.py   Parses LLVM optimization remarks YAML
  src/backend/api/routes/          HTTP endpoints
  tests/                           Pytest tests

frontend/                          Next.js dashboard, TypeScript
  app/(analyze)/analyze/page.tsx   Analyzer page
  components/dashboard/            Editor, heatmap, tables, IR panel
  components/methodology/          Methodology pages
  lib/api.ts                       Backend API client

scripts/
  build.sh                         Build the LLVM pass from Linux/WSL
  run.sh                           Start backend and frontend from Linux/WSL
  build.ps1                        Windows wrapper that builds the pass in WSL
  run.ps1                          Windows wrapper for WSL backend + Windows UI

testcases/                         Labelled sample C++ programs
research/                          Methodology notes and source papers
```

---

## Prerequisites

### Required for the LLVM pass and backend

The LLVM pass must be built and run in Linux. On Windows, use WSL. Ubuntu 24.04
with LLVM 18 is the expected setup.

Inside WSL:

```bash
sudo apt update
sudo apt install -y \
  build-essential cmake ninja-build \
  clang-18 llvm-18 llvm-18-dev lld-18 \
  zlib1g-dev libzstd-dev libedit-dev libcurl4-openssl-dev
```

Install `uv` for the Python backend:

```bash
pip install uv
```

If `pip` is not available yet:

```bash
sudo apt install -y python3-pip
pip install uv
```

### Required for the frontend

Install Node.js 20 or newer. On Linux/WSL you can use `nvm`, your distro's
package manager, or any Node 20+ install. On Windows, installing Node directly
on Windows is fine because the frontend does not need LLVM.

Check versions:

```bash
clang++-18 --version
llc-18 --version
cmake --version
uv --version
node --version
npm --version
```

---

## Important Windows Note

Do not try to build or run the LLVM pass natively in Windows PowerShell. The
pass is a Linux shared object, `EnergyPass.so`, and is loaded by Linux `llc`.

If you are on Windows:

- Build the LLVM pass in WSL.
- Run the backend in WSL so it can call `clang++-18`, `llc-18`, and load
  `EnergyPass.so`.
- Run the frontend either on Windows or in WSL.
- Use the provided PowerShell scripts if you want Windows commands that delegate
  the LLVM/backend work to WSL.

If CMake gets confused after switching between Windows and WSL paths, delete
`llvm-pass/build/` and configure again from WSL.

---

## Setup Option 1: Scripted Setup

Use this route when you want the fastest path and your environment already has
the prerequisites installed.

### Linux or WSL shell

From the repository root:

```bash
./scripts/build.sh
./scripts/run.sh
```

`build.sh` creates:

```text
llvm-pass/build/EnergyPass.so
```

`run.sh` starts:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000/analyze`

Stop the services with `Ctrl+C`.

### Windows PowerShell

Run these commands from the repository root in PowerShell:

```powershell
.\scripts\build.ps1
.\scripts\run.ps1
```

What the Windows scripts do:

- `build.ps1` invokes WSL and builds `llvm-pass/build/EnergyPass.so` there.
- `run.ps1` starts the backend in WSL.
- `run.ps1` starts the frontend in a Windows PowerShell window if Node is
  installed on Windows.

Open:

```text
http://localhost:3000/analyze
```

If the frontend is skipped because Node is missing on Windows, install Node 20+
or start the frontend manually from WSL.

---

## Setup Option 2: Manual Commands

Use this route when you want to understand each service, debug setup issues, or
run the LLVM pass directly.

### 1. Build the LLVM pass in WSL

Open a WSL shell and go to the repo root. If the repo is stored on Windows,
open WSL and `cd` to the repository's WSL path.

```bash
cd /path/to/this/repo
```

If you are currently in Windows PowerShell at the repo root, you can get the
WSL path with:

```powershell
wsl wslpath -a "$PWD"
```

Configure and build:

```bash
export CC=clang-18
export CXX=clang++-18
export LLVM_DIR="$(llvm-config-18 --cmakedir)"

cmake -S llvm-pass -B llvm-pass/build -G Ninja \
  -DLLVM_DIR="$LLVM_DIR" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo

cmake --build llvm-pass/build
```

Expected output file:

```text
llvm-pass/build/EnergyPass.so
```

If you do not have `llvm-config-18`, but `llvm-config` points to the correct
LLVM version, use:

```bash
export LLVM_DIR="$(llvm-config --cmakedir)"
```

### 2. Run the LLVM pass directly

Still inside WSL, compile one testcase to LLVM IR:

```bash
clang++-18 -g -O2 -S -emit-llvm \
  testcases/03_memory_bound.cpp \
  -o /tmp/energy-test.ll
```

Lower LLVM IR to Machine IR:

```bash
llc-18 -O2 -stop-after=finalize-isel \
  /tmp/energy-test.ll \
  -o /tmp/energy-test.mir
```

Run the custom pass:

```bash
llc-18 \
  -load llvm-pass/build/EnergyPass.so \
  -run-pass=energy \
  -energy-model=llvm-pass/models/x86_64-energy-model.json \
  /tmp/energy-test.mir \
  -o /dev/null \
  2>&1 | grep '^\[energy\]'
```

You should see JSON records prefixed with `[energy]`. Those are the records the
backend parser consumes.

### 3. Start the backend manually

Run the backend in WSL, not native Windows, because it invokes the LLVM tools.

```bash
cd backend
cp .env.example .env
uv sync
uv run backend
```

The backend listens on:

```text
http://127.0.0.1:8000
```

Health check:

```bash
curl http://127.0.0.1:8000/healthz
```

Alternative backend command:

```bash
uv run uvicorn backend.main:app --app-dir src --reload
```

If your pass path is different, edit `backend/.env`:

```bash
ENERGY_ANALYZER_CLANGXX=clang++-18
ENERGY_ANALYZER_LLC=llc-18
ENERGY_ANALYZER_LLVM_PASS_SO=../llvm-pass/build/EnergyPass.so
ENERGY_ANALYZER_LOG_LEVEL=INFO
```

You can also use an absolute WSL path if needed:

```bash
ENERGY_ANALYZER_LLVM_PASS_SO="$(pwd)/../llvm-pass/build/EnergyPass.so"
```

### 4. Start the frontend manually

You can run the frontend from Windows PowerShell or WSL. From the repo root:

```bash
cd frontend
npm install
npm run dev
```

The frontend listens on:

```text
http://localhost:3000
```

Open:

```text
http://localhost:3000/analyze
```

By default the frontend calls:

```text
http://127.0.0.1:8000
```

To point it at a different backend URL, create `frontend/.env.local`:

```bash
NEXT_PUBLIC_ANALYZER_API_BASE_URL=http://127.0.0.1:8000
```

---

## API

### `GET /healthz`

Liveness check for the backend.

### `POST /analyze`

Request:

```json
{
  "code": "int main() { return 0; }",
  "filename": "main.cpp",
  "std": "c++20",
  "compilerFlags": ["-O2"]
}
```

Response includes:

- `llvmIr`
- `summary`
- `functions`
- `sourceAnnotations`
- `remarks`

Example:

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{"code":"int main(){return 0;}","filename":"main.cpp","std":"c++20","compilerFlags":["-O2"]}'
```

---

## Backend Configuration

Backend settings are read from `backend/.env` with the
`ENERGY_ANALYZER_` prefix.

| Variable | Default | Description |
| --- | --- | --- |
| `ENERGY_ANALYZER_HOST` | `127.0.0.1` | Backend bind host |
| `ENERGY_ANALYZER_PORT` | `8000` | Backend port |
| `ENERGY_ANALYZER_CLANGXX` | `clang++-18` | C++ compiler used by the backend |
| `ENERGY_ANALYZER_LLC` | `llc-18` | LLVM static compiler used by the backend |
| `ENERGY_ANALYZER_DEFAULT_STD` | `c++20` | Default C++ standard |
| `ENERGY_ANALYZER_LLVM_PASS_SO` | `llvm-pass/build/EnergyPass.so` | Path to the built pass |
| `ENERGY_ANALYZER_ENERGY_MODEL_PATH` | `llvm-pass/models/x86_64-energy-model.json` | Energy model JSON |
| `ENERGY_ANALYZER_LOG_LEVEL` | `INFO` | Backend log verbosity |

---

## Tests

Backend tests:

```bash
cd backend
uv run pytest tests/ -v
```

Frontend lint:

```bash
cd frontend
npm run lint
```

Manual pass smoke test:

```bash
llc-18 \
  -load llvm-pass/build/EnergyPass.so \
  -run-pass=energy \
  -energy-model=llvm-pass/models/x86_64-energy-model.json \
  /tmp/energy-test.mir \
  -o /dev/null
```

---

## Troubleshooting

### `EnergyPass.so not found`

Build the pass first:

```bash
./scripts/build.sh
```

Or on Windows:

```powershell
.\scripts\build.ps1
```

### `llvm-config not found`

Install the LLVM development package in WSL:

```bash
sudo apt install -y llvm-18 llvm-18-dev clang-18
```

### CMake path mismatch between Windows and WSL

Remove the build directory and rebuild from WSL:

```bash
rm -rf llvm-pass/build
./scripts/build.sh
```

### Backend starts but analysis fails

Check that the backend is running in WSL and can find all LLVM tools:

```bash
which clang++-18
which llc-18
test -f llvm-pass/build/EnergyPass.so && echo "pass exists"
```

Also verify `backend/.env` if you customized paths.

### Frontend cannot reach backend

Make sure the backend is healthy:

```bash
curl http://127.0.0.1:8000/healthz
```

If the backend is on another host or port, set
`NEXT_PUBLIC_ANALYZER_API_BASE_URL` in `frontend/.env.local`.
