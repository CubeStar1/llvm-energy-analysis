# Design Document — LLVM Static Energy Estimation Pass

## Problem statement

No production compiler today provides energy feedback to the developer. Existing approaches require hardware performance counters (perf, Intel VTune, ARM Streamline), which demand physical hardware, root access, and an actual program run. The observation motivating this project: a compiler already knows the instruction mix and control-flow structure necessary for a static estimate. The goal is to produce that estimate as a compiler pass, tied to source locations, so a developer can see energy hotspots without running anything.

---

## Design goals

1. **Static** — no execution, no hardware counters.
2. **Source-attributed** — results tied to file, line, and column via DWARF debug info.
3. **Comparative, not absolute** — the model ranks hotspots relative to each other, not in joules.
4. **Extensible model** — costs are in a JSON file, not compiled in, so the model can be updated without recompiling the pass.
5. **Standard integration point** — uses LLVM's existing pass pipeline so it can slot into any workflow that already uses `llc`.

---

## Approach

### Why a MachineFunctionPass

The pass operates on Machine IR (MIR), the representation LLVM uses after instruction selection and before register allocation finalisation. This is the right level for two reasons:

- At MIR level, opcodes are concrete (e.g., `ADD64rr`, `MOV64rm`) rather than abstract (`add i64`), so instruction classification is precise.
- Debug locations (`DILocation`) from DWARF survive through to MIR, enabling source-line attribution.

The alternative — an IR-level (`FunctionPass` on LLVM IR) — would classify abstract IR instructions. Those abstract types map less cleanly to real hardware behaviour (an `add` in IR might lower to one integer add or to a load-and-add or to a vector operation). MIR avoids this ambiguity.

### Pass type: legacy `MachineFunctionPass`

LLVM has two pass manager interfaces: the legacy pass manager (LPM) and the new pass manager (NPM). The LPM is still the standard interface for machine-level passes in out-of-tree plugins. The NPM machine-pass infrastructure exists but its plugin API was not stable for external out-of-tree use in LLVM 18, so the legacy `MachineFunctionPass` + `INITIALIZE_PASS_BEGIN/END` registration pattern was chosen. This allows the pass to be loaded via `llc -load EnergyPass.so -run-pass=energy`.

### Energy model: bucket classification

Each machine instruction is classified into one of seven buckets:

| Bucket | Relative cost | Rationale |
|---|---|---|
| `integer_alu` | 1.0 | Baseline: single-cycle ALU ops |
| `compare` | 1.2 | Marginally higher due to flag write |
| `branch` | 1.6 | Pipeline flush potential |
| `load` | 2.0 | Cache access; L1 hit assumed |
| `fp_or_vector_fallback` | 2.8 | Wider execution units, more ports |
| `store` | 2.2 | Write buffer + cache coherence |
| `call` | 3.0 | Frame setup, spills, indirect dispatch |

These ratios are grounded in published per-instruction energy characterization data for x86-64 (see `research/` and the model's `references` field). The model is deliberately coarse — the goal is comparative ranking of hotspots, not physical measurement.

Classification has two layers:
1. **Opcode alias table** — exact opcode string matches in `opcodeAliases` (e.g. `ADD64rr → integer_alu`). These take precedence.
2. **Heuristic fallback** — uses `MachineInstr` predicate methods (`isCall()`, `isBranch()`, `mayLoad()`, `mayStore()`) plus opcode substring matching (`CMP`, `XMM`, `YMM`, etc.) to infer a bucket for any opcode not in the alias table.

### Output format

The pass emits newline-delimited JSON records to `stderr`, prefixed with `[energy] `. Three record kinds are emitted per function:

- `kind: "function"` — total raw and weighted energy, instruction counts, mapped/fallback breakdown.
- `kind: "block"` — same aggregates per basic block, with the block's first debug location.
- `kind: "line"` — energy attributed to each unique (function, file, line, column) source location, with top contributing opcodes.

This format was chosen over LLVM optimization remarks YAML because it gives the backend fine-grained structured data with explicit field names, without requiring the pass to implement the remarks emission API. The backend parser (`parsers/energy.py`) is a simple line scanner.

### Frequency weighting

The design includes a `frequencyWeight` field on each block so that loop bodies can be weighted by execution count. In the current implementation this weight is always 1.0 — LLVM 18 removed the `MachineBlockFrequencyInfo` wrapper that was available in older out-of-tree pass shapes, and reintroducing it through a compatible API path is a known follow-on task. The architecture is in place; the weighted and raw energy fields are already separate in the output, so the frontend and parser can consume frequency data without changes when it is added.

---

## Alternatives considered

### Alternative 1: IR-level FunctionPass

Classify LLVM IR instructions (`add`, `load`, `store`, `call`, etc.) rather than MIR opcodes.

**Pros:** Simpler — no need to lower to MIR; works with any target.  
**Cons:** IR instructions are too abstract. A single IR `load` might lower to a simple register load or to a complex addressing-mode instruction. Classification at IR level would miss this distinction. Debug location coverage is also slightly lower at IR level for some optimisation patterns.

**Decision:** Rejected. MIR opcodes are more faithful to hardware behaviour.

### Alternative 2: LLVM optimization remarks system

Use `llvm::OptimizationRemark` / `llvm::DiagnosticInfoOptimizationBase` to emit energy data through LLVM's native `-Rpass-analysis` remark system, which writes YAML.

**Pros:** Integrates with existing tooling (`opt-viewer`, IDE plugins).  
**Cons:** The remark API in the legacy pass manager requires access to `OptimizationRemarkEmitter`, which must be explicitly requested via `getAnalysisUsage`. In LLVM 18, wiring this in an out-of-tree `MachineFunctionPass` requires additional boilerplate and the remark schema is less flexible for structured numeric data. The backend would also need to parse YAML with tagged documents.

**Decision:** Rejected for the primary output. A YAML remarks parser (`parsers/remarks.py`) is included as a secondary path and will be used if the pass ever switches to the remark system.

### Alternative 3: Hardware counter profiling (perf / RAPL)

Instrument the compiled binary and use Linux `perf` or Intel RAPL to measure real energy.

**Pros:** Physically accurate.  
**Cons:** Requires root or `CAP_PERFMON`, a physical run, hardware that supports RAPL (not all cloud VMs do), and a representative input. Breaks the "static" goal entirely.

**Decision:** Out of scope for this assignment, which explicitly requires a static compiler pass.

### Alternative 4: LLVM Cost Model (TargetTransformInfo)

Use `TargetTransformInfo::getInstructionCost()` which is already part of LLVM and provides target-aware instruction costs used by vectorizers and loop optimizers.

**Pros:** Reuses existing LLVM infrastructure; costs already calibrated for many targets.  
**Cons:** TTI costs are throughput estimates for vectorizer decisions, not energy proxies. They have no concept of memory-hierarchy energy, and they are not available in the legacy machine pass pipeline. Adapting them would require significant LLVM internals work.

**Decision:** The bucket model is simpler, fully transparent, and directly motivated by the published energy data.

---

## System architecture

```
User C/C++ source
        │
        ▼
  clang++-18 -g -O2 -S -emit-llvm
        │
        ▼ LLVM IR (.ll)
        │
  llc-18 -stop-after=finalize-isel
        │
        ▼ Machine IR (.mir)
        │
  llc-18 -load EnergyPass.so -run-pass=energy
        │
        ├── stderr: [energy] {JSON} lines ──► Python parser ──► FastAPI response
        │
        └── (no object output — analysis only)
                                                      │
                                                      ▼
                                              Next.js dashboard
                                     (Monaco editor, source heatmap,
                                      function table, LLVM IR view)
```
