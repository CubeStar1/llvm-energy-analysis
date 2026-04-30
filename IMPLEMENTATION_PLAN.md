# LLVM Energy Analyzer Implementation Plan

## Goal
Build a local-first developer tool that lets a user write C++ in a Next.js app, run analysis, inspect LLVM IR, and view source-linked energy remarks produced by a custom LLVM machine-level pass.

The first milestone is an MVP that is accurate enough for the assignment, stable enough to demo, and structured so the energy model can be improved later without redesigning the system.

## Final Platform Choice
- Primary development environment: `WSL2 Ubuntu 24.04`
- Editor/UI shell: `VS Code Remote - WSL`
- Frontend runtime: `Next.js 16.2.4` in WSL
- Backend runtime: Python service in WSL
- LLVM toolchain: Linux-native build in WSL

Keep the repo inside the Linux filesystem, not under `/mnt/c`, once active development starts for the backend.

## Existing Frontend Baseline
- `Next.js 16.2.4`
- `React 19.2.4`
- `TypeScript 5`
- `Tailwind CSS 4`
- `shadcn` with `radix-vega`
- `lucide-react`

This means the frontend should stay focused on UI, state, and visualization only. It should not run LLVM work itself.

## Exact Backend Stack
### Core analysis layer
- Language: `C++17`
- Build system: `CMake`
- Build generator: `Ninja`
- LLVM integration style: out-of-tree LLVM pass plugin plus a small driver workflow
- LLVM target for MVP: `x86-64`
- LLVM data sources:
  - `MachineFunction`
  - `MachineBasicBlock`
  - `MachineInstr`
  - `MachineBlockFrequencyInfo`
  - debug locations for source mapping

### Service layer
- Language: `Python 3.12`
- Framework: `FastAPI`
- ASGI server: `uvicorn`
- Validation layer: `Pydantic v2`
- YAML parsing: `PyYAML`
- JSON serialization: standard `json` first, `orjson` optional later
- Process execution: `asyncio.create_subprocess_exec`
- Job storage: local temp directories only for MVP

### Why this stack
- LLVM pass code belongs in C++, not Python or Node.
- The orchestration layer needs safe subprocess control and easy artifact parsing; FastAPI is the simplest reliable choice.
- Next.js can talk to FastAPI over HTTP cleanly and remain independent from compiler toolchain concerns.

## System Architecture
### Frontend
- Monaco editor for C++
- Run Analysis button
- Dashboard panels:
  - Source heatmap
  - LLVM IR viewer
  - Remarks table
  - Function energy ranking
  - Summary cards

### Backend service
- Receives source code and compile options
- Creates an isolated temp workspace per run
- Writes `input.cpp`
- Invokes Clang to emit LLVM IR for display
- Invokes the LLVM energy analysis workflow for machine-level estimation
- Parses emitted remarks and normalizes them into frontend-friendly JSON
- Returns a single response containing:
  - LLVM IR
  - structured remarks
  - per-function totals
  - per-line annotations
  - summary metrics

### LLVM plugin
- Custom pass name: `energy`
- Pass type: `MachineFunctionPass`
- Responsibilities:
  - assign per-instruction energy using a JSON model
  - accumulate per-basic-block energy
  - weight blocks with machine block frequency
  - aggregate per-function totals
  - emit `Analysis` remarks with source locations where available

## Recommended Repository Layout
```text
CD/
  frontend/
  backend/
    app/
      main.py
      api/
      services/
      schemas/
      parsers/
    tools/
    tests/
  llvm-pass/
    CMakeLists.txt
    include/
    src/
    models/
      x86_64-energy-model.json
    test/
  docs/
```

## Backend API Contract
### `POST /analyze`
Request body:
```json
{
  "code": "string",
  "filename": "main.cpp",
  "std": "c++20",
  "compilerFlags": ["-O2"]
}
```

Response body:
```json
{
  "runId": "uuid-or-timestamp",
  "llvmIr": "string",
  "summary": {
    "totalWeightedEnergy": 0.0,
    "hottestFunction": "main",
    "hottestLine": 12
  },
  "functions": [],
  "sourceAnnotations": [],
  "remarks": []
}
```

### Normalized response objects
- `functions[]`
  - `name`
  - `weightedEnergy`
  - `rawEnergy`
  - `blockCount`
- `sourceAnnotations[]`
  - `file`
  - `line`
  - `column`
  - `weightedEnergy`
  - `instructionCount`
  - `topOpcodes`
- `remarks[]`
  - `kind`
  - `pass`
  - `function`
  - `message`
  - `file`
  - `line`
  - `column`
  - `metadata`

## LLVM Analysis Workflow
### Compilation path for each run
1. Save incoming code to temp workspace.
2. Run Clang with `-g -O2 -S -emit-llvm` to produce textual LLVM IR for the UI.
3. Run the codegen pipeline with the custom energy pass enabled for `x86-64`.
4. Emit optimization remarks to YAML.
5. Parse YAML into normalized JSON.
6. Return both raw artifacts and structured summaries.

### Important implementation choices
- Use `-g` so machine instructions retain source debug locations.
- Use `-O2` for the MVP so block frequency and codegen are meaningful.
- Use one target only at first: `x86-64`.
- Treat missing opcode mappings with a documented default energy fallback.
- Count instructions without debug locations in function totals, but do not attach them to source-line heatmaps.

## Energy Model Strategy
### MVP model shape
Use a JSON file with:
- target metadata
- source paper references
- default fallback cost
- opcode-to-cost entries
- opcode alias groups
- notes on any coarse approximations

### Modeling approach
- Start with coarse instruction classes rather than pretending to have exact desktop CPU microjoules per opcode.
- Map LLVM machine opcodes into stable buckets:
  - integer ALU
  - load
  - store
  - branch
  - call
  - compare
  - vector or FP fallback
- Use the papers in `research/` to justify relative costs and the validation narrative.

### What to claim
- This is a static estimation and feedback tool.
- It is useful for comparative hotspot identification.
- It is not a physical power meter.

## Frontend Dashboard Plan
### Main screen
- Top bar with target, optimization level, and Run Analysis button
- Left pane with Monaco editor
- Right pane with tabs

### Tabs
- `Source`
  - code view with line heat overlay
  - hover tooltip for energy info
- `LLVM IR`
  - read-only formatted IR
- `Remarks`
  - sortable table of analysis remarks
- `Functions`
  - ranked bars or table by weighted energy

### Visual language
- Use a clean lab-tool look, not a generic admin panel.
- Use a light neutral base with heat colors for annotations.
- Use intensity and small badges to show hotspots.
- Keep the editor and data panels dense and practical.

## Implementation Order
### Phase 1
- Set up WSL development environment
- Create `backend/` FastAPI service skeleton
- Create `llvm-pass/` CMake project skeleton
- Define the JSON schema for the energy model

### Phase 2
- Implement LLVM pass with opcode lookup and per-function totals
- Add block frequency weighting
- Emit remarks with source locations
- Produce raw YAML remarks successfully

### Phase 3
- Build backend orchestration around compile, run, parse, return
- Normalize remarks and per-line aggregates into response JSON
- Add basic tests for parsing and API responses

### Phase 4
- Replace starter Next.js page with analysis dashboard shell
- Add Monaco editor
- Integrate `POST /analyze`
- Render IR, remarks, function table, and source heatmap

### Phase 5
- Improve energy model coverage
- Add report export
- Add demo examples with different behavior profiles

## Validation Plan
- Use small C++ fixtures with known behavior:
  - arithmetic-heavy
  - memory-heavy
  - branch-heavy
  - loop-heavy
- Check that:
  - remarks are emitted
  - source lines map correctly
  - function rankings are stable
  - loop-heavy programs show higher weighted totals in hot blocks
- Compare qualitative trends against the papers in `research/`.

## Immediate Next Work
1. Create the backend service skeleton in `backend/`.
2. Create the LLVM pass project in `llvm-pass/`.
3. Decide the exact LLVM version to target in WSL and install the matching dev packages.
4. Implement a minimal end-to-end run that returns:
   - LLVM IR
   - a stub energy summary
   - parsed remarks structure

## Assumptions
- The frontend remains in `frontend/` and is already the correct place for the dashboard.
- The MVP runs locally on one machine.
- No database is needed yet.
- No authentication is needed yet.
- `x86-64` is the only supported target in the first milestone.
- Manual analysis is the correct first interaction model; live-on-pause can come later.
