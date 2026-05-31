# Implementation - LLVM Energy Analyzer

## Main Components

| Area | Files | Responsibility |
| --- | --- | --- |
| LLVM pass | `llvm-pass/src/EnergyAnalysisPass.cpp`, `llvm-pass/include/energy/EnergyAnalysisPass.h` | Walk Machine IR, accumulate raw/weighted energy, emit JSON and LLVM remarks. |
| Energy model | `llvm-pass/src/EnergyModel.cpp`, `llvm-pass/include/energy/EnergyModel.h`, `llvm-pass/models/*.json` | Load opcode bucket costs and classify machine instructions. |
| Backend orchestration | `backend/src/backend/services/compiler.py` | Run `clang++`, create MIR with `llc`, load the pass, capture stderr. |
| Backend parsing/API | `backend/src/backend/parsers/*.py`, `backend/src/backend/services/analyzer.py`, `backend/src/backend/api/routes/*.py` | Convert pass output and remarks into stable API responses and HTML reports. |
| Frontend | `frontend/components/dashboard/*`, `frontend/lib/api.ts`, `frontend/lib/types.ts` | Submit source code, render metrics, heatmap, IR, remarks, and function rankings. |

## LLVM Pass

The pass is an out-of-tree legacy `MachineFunctionPass` registered as
`energy`:

```cpp
class EnergyAnalysisPass final : public MachineFunctionPass {
public:
  static char ID;
  bool runOnMachineFunction(MachineFunction &machineFunction) override;
  void getAnalysisUsage(AnalysisUsage &analysisUsage) const override;
};
```

It declares these analysis dependencies:

- `MachineLoopInfo`, used to compute loop depth for each machine basic block;
- `MachineOptimizationRemarkEmitterPass`, used to emit LLVM analysis remarks.

The pass returns `false` because it is pure analysis and does not mutate MIR.

## Compilation Pipeline

The backend runs the pass in three stages inside a temporary workspace:

```text
clang++-18 source.cpp -std=c++20 -g -S -emit-llvm [-O2] -o input.ll
llc-18 [-O2] -stop-after=finalize-isel input.ll -o input.mir
llc-18 -load EnergyPass.so -run-pass=energy \
       -energy-model=llvm-pass/models/x86_64-energy-model.json \
       -pass-remarks-analysis=energy \
       -pass-remarks-output=energy-remarks.yaml \
       input.mir -o /dev/null
```

`finalize-isel` is used because target opcodes are available and debug
locations are still attached. The second `llc` invocation runs only the custom
machine pass over the generated MIR. Structured `[energy]` records are written
to stderr and parsed by the backend.

## Energy Accumulation

For each machine function, the pass builds three summary types:

| Summary | Key | Purpose |
| --- | --- | --- |
| `FunctionSummary` | function name | Function totals, block count, instruction count, mapped/fallback counts. |
| `BlockSummary` | machine basic block | Raw/weighted block totals, loop-derived `frequencyWeight`, first source location. |
| `SourceLocationSummary` | function, file, line, column | Source-level totals and top opcode contributors. |

For every `MachineInstr`:

1. `EnergyModel::classify()` returns a bucket, cost, and fallback flag.
2. The block's loop depth is converted to `frequencyWeight = 10^depth`.
3. Raw energy adds the model cost.
4. Weighted energy adds `cost * frequencyWeight`.
5. Function and block instruction counters are incremented.
6. If the instruction has a valid `DILocation`, the matching source summary is
   updated.

The loop-depth weighting is intentionally simple and static. It follows the
classic Ball-Larus style assumption that each loop level represents roughly 10
iterations.

## Energy Model

`EnergyModel::loadOrCreateDefault(modelPath)` starts with compiled-in defaults
and then overlays JSON fields if a model file is available:

```json
{
  "defaultFallbackCost": 1.0,
  "opcodeBuckets": {
    "integer_alu": 1.0,
    "load": 2.0,
    "store": 2.2,
    "branch": 1.6,
    "call": 3.0,
    "compare": 1.2,
    "fp_or_vector_fallback": 2.8
  },
  "opcodeAliases": {
    "ADD64rr": "integer_alu",
    "MOV64rm": "load",
    "CALL64pcrel32": "call"
  }
}
```

Classification order:

1. Exact opcode alias lookup.
2. `MachineInstr::isCall()`.
3. `MachineInstr::isBranch()`.
4. `MachineInstr::mayLoad()`.
5. `MachineInstr::mayStore()`.
6. Opcode name contains compare tokens such as `CMP` or `TEST`.
7. Opcode name contains FP/vector tokens such as `XMM`, `YMM`, `ZMM`, `FADD`,
   `FMUL`, or `FDIV`.
8. Fallback to `integer_alu`.

The default x86-64 model is version 3 with an expanded alias table. An AArch64
model is also available and can be selected by changing
`ENERGY_ANALYZER_ENERGY_MODEL_PATH`.

## Pass Output

The primary machine-readable output is newline-delimited JSON on stderr. Each
record starts with `[energy] `:

```text
[energy] {"kind":"function","function":"main","rawEnergy":8.2,
  "weightedEnergy":42.2,"blockCount":4,"instructionCount":17,
  "mappedInstructionCount":16,"fallbackInstructionCount":1}

[energy] {"kind":"block","function":"main","block":"bb.1",
  "rawEnergy":5.0,"weightedEnergy":50.0,"frequencyWeight":10.0,
  "instructionCount":4,"mappedInstructionCount":4,"fallbackInstructionCount":0,
  "file":"/tmp/main.cpp","line":6,"column":3}

[energy] {"kind":"line","function":"main","file":"/tmp/main.cpp",
  "line":7,"column":5,"rawEnergy":3.2,"weightedEnergy":32.0,
  "instructionCount":2,"topOpcodes":["ADD64rr","JCC_1"]}
```

The backend parser currently consumes `function` and `line` records. `block`
records are still emitted for debugging, future API exposure, and parity with
the pass's internal scope model.

The pass also emits LLVM optimization remarks:

- `FunctionEnergy` remarks for each function;
- `HotBlock` remarks for loop-weighted blocks where `frequencyWeight > 1`.

The backend asks `llc` to write these to `energy-remarks.yaml` using
`-pass-remarks-analysis=energy` and `-pass-remarks-output=...`.

## Backend Flow

`CompilerService.emit_llvm_ir()`:

1. refreshes `clang++` and `llc` paths;
2. writes `input.ll` using `clang++` with debug info;
3. lowers to `input.mir`;
4. runs the energy pass;
5. parses pass stderr into `ParsedEnergyReport`;
6. returns LLVM IR plus the energy result.

`parse_energy_pass_output()` scans stderr for `[energy]` JSON records. It
stores:

- `ParsedFunctionEnergy` records sorted by weighted energy descending;
- `ParsedSourceAnnotation` records sorted by weighted energy descending.

`AnalyzerService.analyze()` then builds the public `AnalyzeResponse`:

```text
runId
llvmIr
summary
functions
sourceAnnotations
remarks
```

Remarks come from the YAML file when present. If no YAML remarks are available,
the backend synthesizes energy remarks from the parsed line and function data.

## HTTP API

`GET /healthz`

Returns backend liveness:

```json
{"status":"ok"}
```

`POST /analyze`

Accepts C/C++ source and compile options, then returns structured JSON for the
dashboard.

`POST /report`

Runs the same analysis path and returns a self-contained HTML report with
summary cards, a function table, and annotated source.

## Frontend Flow

The dashboard submits `AnalyzeRequest` through `frontend/lib/api.ts`. The
response type is declared in `frontend/lib/types.ts`.

Visible analysis surfaces:

- stats cards for total weighted/raw energy, hottest function, hottest line,
  and last run time;
- source heatmap using weighted energy per displayed source line;
- LLVM IR panel;
- remarks table;
- function ranking panel.

The source heatmap aggregates duplicate annotations that map to the same source
line before rendering, because the pass may produce separate records for
different columns or functions but the editor view is line-oriented.

## Build

The LLVM pass is built as an out-of-tree CMake module producing `EnergyPass.so`.
Use the provided script from the repo root in WSL/Linux:

```bash
./llvm-pass/scripts/build.sh
```

To run the pass over all testcases without the backend or frontend:

```bash
./scripts/run-tests.sh
```

On Windows, build and run the LLVM/backend portion in WSL. A build directory
configured from WSL must not be reused from native PowerShell because CMake
stores absolute generator paths.

## Verification

Backend tests:

```bash
cd backend && uv run pytest tests/ -v
```

Frontend lint:

```bash
cd frontend && npm run lint
```
