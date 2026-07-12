# Design - Static Energy Analysis System

## Problem

Developers can usually inspect time and memory, but energy feedback is harder:
hardware counters require a real run, platform support, permissions, and
representative input data. This project explores a static compiler-based
alternative. It estimates relative energy from the machine instructions LLVM
would generate and projects those estimates back onto functions and source
lines.

The result is not a physical power measurement. It is a compile-time signal for
questions like:

- Which function is likely more energy-heavy?
- Which source lines sit inside statically hot loop structure?
- Is this code dominated by integer ALU, memory, branch, call, or FP/vector
  work?

## Goals

1. Static: no execution, hardware counters, or privileged profiling.
2. Source-attributed: use debug locations to connect machine instructions back
   to source lines.
3. Comparative: rank hotspots with dimensionless relative energy values.
4. Extensible: keep target costs in JSON models rather than hardcoding every
   opcode in C++.
5. Usable: expose results through a FastAPI backend and a Next.js dashboard.
6. Inspectable: emit both custom JSON records and LLVM analysis remarks.

## Non-Goals

- Measuring joules, watts, cycles, cache misses, or thermal behavior.
- Predicting actual loop trip counts or branch probabilities.
- Inter-procedural whole-program energy accounting.
- Replacing dynamic profilers such as `perf`, Intel VTune, ARM Streamline, or
  RAPL-based measurement.

## Architecture

```text
C/C++ source from dashboard
        |
        v
FastAPI backend writes temporary source file
        |
        v
clang++ -g -S -emit-llvm
        |
        v
LLVM IR (.ll)
        |
        v
llc -stop-after=finalize-isel
        |
        v
Machine IR (.mir)
        |
        v
llc -load EnergyPass.so -run-pass=energy
        |
        +--> stderr: [energy] JSON records --> backend parser
        |
        +--> energy-remarks.yaml -----------> remarks parser
                                             |
                                             v
                                  AnalyzeResponse / HTML report
                                             |
                                             v
                                  Next.js dashboard heatmap
```

## Why Machine IR

The analysis runs after instruction selection, on LLVM Machine IR. This level
was chosen because machine opcodes are close enough to target instructions to
make instruction-mix analysis meaningful. For example, MIR can distinguish
`ADD64rr`, `MOV64rm`, `CALL64pcrel32`, and `JCC_1`, while LLVM IR would only
show abstract operations such as `add`, `load`, and `call`.

Machine IR also keeps useful `DILocation` metadata when code is compiled with
`-g`, allowing the pass to attribute costs back to file, line, and column.

## Pass Interface

The pass uses the legacy `MachineFunctionPass` interface because this remains
the practical out-of-tree plugin path for machine-level LLVM passes in LLVM 18.
It is loaded with:

```bash
llc -load EnergyPass.so -run-pass=energy input.mir -o /dev/null
```

The pass requires:

- `MachineBlockFrequencyInfo` for static execution-frequency weighting;
- `MachineLoopInfo` for loop depth, loop headers, and the `-O0` fallback weight;
- `MachineOptimizationRemarkEmitterPass` for LLVM-native analysis remarks.

## Energy Model

The model is bucket-based. Exact opcode aliases take precedence, and all other
instructions are classified with LLVM instruction predicates and opcode-name
heuristics.

| Bucket | Intent |
| --- | --- |
| `integer_alu` | Scalar integer arithmetic, logic, shifts, simple register moves. |
| `compare` | Flag-setting compares and tests. |
| `branch` | Conditional/unconditional branches and returns. |
| `load` | Instructions that may read memory. |
| `store` | Instructions that may write memory. |
| `fp_or_vector_fallback` | Floating-point and SIMD/vector work. |
| `call` | Direct or indirect calls. |

The current default costs are coarse ratios, with integer ALU as the baseline.
They are designed to preserve ordering, not to calibrate absolute energy. The
x86-64 model includes an expanded alias table; the AArch64 model follows the
same schema so the pass itself remains target-agnostic.

## Frequency Weighting

Raw instruction cost alone under-ranks loop bodies because static MIR only
contains one copy of the loop body. Each block therefore carries a frequency
weight: its expected number of executions per call of the enclosing function.

The primary model is LLVM's own `MachineBlockFrequencyInfo`, which propagates
machine branch probabilities through the CFG. This gives two things a loop-depth
heuristic cannot:

- loop bodies scale by the actual back-edge probability (LLVM's static estimate
  is ~97% taken, implying roughly 32 iterations) rather than by a fixed constant;
- blocks behind a conditional branch are *discounted* below 1.0 instead of being
  costed as if they always run, so cold error paths stop inflating the estimate.

The model has one precondition: real branch probabilities. At `-O0`, clang marks
every function `optnone` and SelectionDAG never runs branch-probability analysis,
leaving every branch at a flat 50/50 — which claims each loop iterates exactly
twice. There the pass falls back to the classic loop-depth estimate:

```text
depth 0 -> weight 1
depth 1 -> weight 10
depth 2 -> weight 100
```

Each `function` record reports which model produced its numbers
(`"frequencyModel": "block-frequency" | "loop-depth"`), and the CFG view labels
the weights accordingly. Both remain static estimates: neither knows real data
sizes, so input-sensitive algorithms may look hotter or colder than a real run.

## Output Design

The pass has two output channels.

Primary channel: `[energy]` JSON lines on stderr. These are easy for the backend
to parse and contain stable numeric fields:

- `function` records for function-level totals and the frequency model in use;
- `block` records for machine-basic-block totals, frequency weights, CFG
  successors, and the block's instructions (capped at 40);
- `line` records for source-attributed totals and top opcodes.

The `block` records' `number` + `successors` fields are the control-flow graph:
the backend groups them by function and the CFG tab renders them directly. Block
*names* are dropped by the optimizer at `-O2`, so `number` is the identity and
the UI falls back to the MIR-style `%bb.N` label.

Secondary channel: LLVM optimization remarks YAML. These integrate with LLVM's
remark mechanism and are useful for tools that already understand
`-pass-remarks-analysis`. The backend parses YAML remarks when available and
falls back to synthesized remarks from JSON records if needed.

Using both channels gives the application a stable API-friendly data stream
without giving up LLVM-native diagnostics.

## Backend Design

The backend is deliberately thin. It owns process orchestration and contract
stability rather than energy logic:

- `CompilerService` runs the toolchain and captures stderr/YAML output.
- `parse_energy_pass_output` converts JSON lines into dataclasses.
- `parse_remarks_documents` handles LLVM YAML remarks.
- `AnalyzerService` builds the public Pydantic response.
- `generate_html` creates a standalone report for sharing or archival use.

Each request runs in a temporary workspace, keeping concurrent analyses
isolated and avoiding project-directory churn.

## Frontend Design

The dashboard is built around repeated inspection:

- edit C/C++ source;
- select standard and compiler flags;
- run analysis;
- compare weighted and raw totals;
- inspect source-line hotspots;
- inspect LLVM IR and remarks;
- compare functions.

The heatmap intentionally shows weighted energy, because that is the most useful
hotspot signal. Function cards also expose raw energy so users can separate
"many instructions in a loop" from "expensive instruction mix."

## Alternatives Considered

### LLVM IR pass

Rejected as the primary analysis level because LLVM IR is too abstract for this
project's goal. It is portable and simpler, but less faithful to target opcode
mix.

### Dynamic hardware profiling

Rejected because it violates the static/no-execution goal and requires platform
support, permissions, and representative input. It would be the right tool for
physical validation, not for the core assignment.

### LLVM TargetTransformInfo cost model

Rejected for the main estimator because TTI is intended for optimization
profitability and throughput-style decisions. It is not an explicit energy
model, and it does not naturally provide the source-scoped machine-instruction
breakdown this tool needs.

### Only LLVM optimization remarks

Rejected as the only output channel because YAML remarks are less convenient as
an application data contract. The current design keeps remarks, but uses JSON
lines as the primary backend input.

## Risks and Limitations

- Debug information can be imperfect after optimization.
- Inlining can remove functions or move energy into callers.
- Static frequency weighting has no knowledge of real trip counts. LLVM's
  block-frequency model assumes a fixed back-edge probability, so it still
  understates loops with large or input-dependent trip counts, and the `-O0`
  loop-depth fallback is coarser again.
- The model treats memory operations coarsely and does not distinguish L1 hits,
  cache misses, DRAM traffic, or vector width in a calibrated way.
- The backend currently exposes function and source-line records; block records
  are emitted by the pass but not yet first-class in the public response.

These limitations are acceptable for the current goal: a transparent static
compiler analysis that helps developers compare likely energy hotspots before
running the program.
