# LLVM Energy Pass

Out-of-tree `MachineFunctionPass` that classifies machine instructions into energy cost buckets and emits per-function JSON records to stderr.

## Structure

- `src/EnergyAnalysisPass.cpp` — pass registration and instruction walk
- `src/EnergyModel.cpp` — JSON model loader and opcode classifier
- `include/energy/` — public headers
- `models/` — instruction cost tables (x86_64 and aarch64)
- `scripts/` — build and run helpers
- `test/fixtures/` — sample inputs

## Build

From the repo root in WSL/Linux:

```bash
./llvm-pass/scripts/build.sh
```

Output: `llvm-pass/build/EnergyPass.so`

## Run on a file

```bash
./llvm-pass/scripts/run-pass.sh testcases/03_memory_bound.cpp
```

Prints `[energy]` JSON records for each function. Omit the argument to use the default testcase.

## Energy model

Cost tables live in `models/` as JSON. The default is `x86_64-energy-model.json`. Pass a different model via `--energy-model` if needed.
