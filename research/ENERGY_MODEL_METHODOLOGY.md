# Research-Grade Energy Model Methodology

## Primary Reference
- `research/llvm-energy-scopes.pdf`

## Goal
Move the analyzer from a single-pass heuristic into a scoped static analysis pipeline that can:
- attribute energy per instruction
- aggregate energy per basic block and function
- surface source-line hotspots through debug information
- remain extensible toward stronger LLVM IR to ISA mapping and future calibration work

## Methodology
### 1. Explicit energy model
- Keep costs outside the pass in `llvm-pass/models/x86_64-energy-model.json`.
- Treat the model as a versioned research artifact, not embedded code.
- Use aliases for known opcodes and documented fallback buckets for partial coverage.

### 2. Scope-based aggregation
- Compute raw energy by summing per-instruction cost.
- Compute weighted energy by multiplying instruction cost by machine basic block frequency.
- Aggregate at:
  - instruction scope
  - source-line scope
  - basic-block scope
  - function scope

This follows the paper’s main idea of assigning energy to program segments and then composing those segments into higher-level summaries.

### 3. Source attribution
- Use debug locations on machine instructions to propagate costs back to source lines.
- Keep instructions without debug locations in function totals, but do not force them into line heatmaps.
- Emit structured scope records so the backend can evolve independently from LLVM internals.

### 4. Backend normalization
- Parse structured energy records from the LLVM pass.
- Convert them into stable API objects for the UI:
  - `functions`
  - `sourceAnnotations`
  - `remarks`
  - `summary`

### 5. Validation strategy
- Start with qualitative validation:
  - loop-heavy code should dominate weighted energy
  - branch-heavy code should produce concentrated hot blocks
  - memory-heavy code should show stronger load/store contribution
- Then improve toward quantitative validation:
  - collect representative opcode traces
  - expand alias coverage from observed machine instructions
  - compare static rankings with measured hardware or RAPL-style external measurements where available

## Current Implementation Boundaries
- This implementation is static and comparative, not physically calibrated for modern x86 CPUs.
- It applies the paper’s scoped attribution and aggregation approach to the current machine-level pass architecture already present in the repo.
- It is designed so a future LLVM IR mapping stage can replace or complement today’s opcode bucket model without changing the backend contract.

## Next Research Steps
1. Expand opcode alias coverage from real analysis traces.
2. Add block-to-loop summarization so loop scopes are first-class in the UI.
3. Introduce calibration datasets per target architecture.
4. Compare direct LLVM IR modeling against machine-level mapped modeling.
5. Add benchmark fixtures and error reporting against measured runs.
