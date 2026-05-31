# Evaluation - LLVM Static Energy Estimation

## Scope

This project reports relative static energy, not measured joules. The pass does
not execute the program, sample hardware counters, or model cache misses from
real inputs. Evaluation therefore checks whether the implementation gives useful
comparative signals:

- instructions are classified into the intended energy buckets;
- loop-contained code receives a larger weighted score than straight-line code;
- source annotations point at the lines that caused the machine instructions;
- backend and frontend preserve the pass output without changing its meaning;
- reports and tests make the static/relative nature of the estimate clear.

The current default path is x86-64 with LLVM 18, `clang++-18`, `llc-18`,
`-g`, and `-O2`. The AArch64 model is present and follows the same schema, but
the default backend configuration points at `x86_64-energy-model.json`.

## Energy Values

The pass emits two energy totals for each scope:

| Field | Meaning |
| --- | --- |
| `rawEnergy` | Sum of per-instruction model costs. |
| `weightedEnergy` | Raw instruction cost multiplied by a block frequency weight. |

The current frequency model is a static loop-depth heuristic:

```text
frequencyWeight = 10 ^ loopDepth
weightedInstructionEnergy = instructionCost * frequencyWeight
```

This means code in a top-level loop is weighted by `10`, code in a nested loop
by `100`, and so on. The value is a hotspot ranking heuristic. It is not the
actual runtime trip count of a `for`, `while`, priority queue, or graph
algorithm.

The frontend heatmap intentionally displays weighted energy because the user is
usually looking for hot source regions. Raw energy is still returned in the API
and shown in summary/function views for comparison.

## Default Model

The x86-64 model is version 3 and lives at:

```text
llvm-pass/models/x86_64-energy-model.json
```

| Bucket | Cost | Examples |
| --- | ---: | --- |
| `integer_alu` | 1.0 | `ADD64rr`, `SUB32rr`, `LEA64r`, register moves |
| `compare` | 1.2 | `CMP64rr`, `TEST32rr`, floating compare aliases |
| `branch` | 1.6 | `JCC_1`, `JMP_4`, `RET64` |
| `load` | 2.0 | `MOV64rm`, `MOV32rm`, scalar/vector loads |
| `store` | 2.2 | `MOV64mr`, `MOV32mr`, scalar/vector stores |
| `fp_or_vector_fallback` | 2.8 | SSE/AVX FP and vector operations |
| `call` | 3.0 | `CALL64pcrel32`, indirect calls |
| `default_fallback` | 1.0 | Last resort when no bucket can be found |

The model first applies exact opcode aliases, then falls back to LLVM
`MachineInstr` predicates such as `isCall()`, `isBranch()`, `mayLoad()`, and
`mayStore()`, plus opcode-name checks for compares and FP/vector work.

## Expected Behavior on Sample Programs

The repository keeps six representative C++ programs under `testcases/`.

| Case | Main signal expected |
| --- | --- |
| `01_empty_main.cpp` | Small non-zero baseline from return/prologue/epilogue instructions. |
| `02_loop_hotspot.cpp` | Loop header/body lines should dominate weighted energy. |
| `03_memory_bound.cpp` | Load/store-heavy functions should outrank pure integer ALU work per instruction. |
| `04_branch_heavy.cpp` | Compare/branch chains and call sites should stand out. |
| `05_fp_vector.cpp` | FP/vector aliases or fallback bucket should raise average cost per instruction. |
| `06_call_chain.cpp` | Calls are expensive when not inlined; at `-O2`, inlining may collapse functions into `main`. |

Because analysis happens after optimization and instruction selection, exact
line numbers and instruction counts can change with flags. For example, `-O0`
usually preserves source structure better but emits more frame and memory
traffic, while `-O2` may inline calls or remove dead loops.

## Interpreting Heatmap Output

Large values in loops are expected. For example, a source line with raw cost
`9.2` inside a loop at depth 2 becomes `920.0` after weighting. That is a sign
that the line is statically nested in hot control flow, not that the program
spent exactly 920 joules or 920 cycles there.

The pass emits line records keyed by `(function, file, line, column)`. The
backend preserves those records as `sourceAnnotations`. The React source
heatmap aggregates annotations with the same line number before displaying
them, because users read the editor by line rather than by debug column.

## Backend and API Validation

The Python backend is evaluated through parser, API, report, and validation
tests. At the time of this documentation there are 32 backend tests:

| Area | Representative tests |
| --- | --- |
| Energy parser | Parses `[energy]` function and line JSON records, weighted energy, top opcodes, and mapped/fallback counts. |
| Remarks parser | Parses LLVM optimization remarks YAML with tagged documents. |
| API contract | `POST /analyze` returns `runId`, `llvmIr`, `summary`, `functions`, `sourceAnnotations`, and `remarks`. |
| Error handling | Missing toolchain/pass failures return HTTP 400 with a useful message. |
| Report output | `POST /report` returns self-contained HTML with summary cards, function table, and annotated source. |
| Model validation | x86-64/AArch64 bucket ordering, alias coverage, model version, and fallback consistency. |
| Frequency weighting | Weighted energy equals raw at depth 0 and exceeds raw for loop-body records. |

Run the tests from the backend directory:

```bash
cd backend
uv sync
uv run pytest tests/ -v
```

## Frontend Validation

The frontend consumes the `AnalyzeResponse` contract in `frontend/lib/types.ts`.
The dashboard currently provides:

- a source editor and compile-flag controls;
- summary cards for total weighted/raw energy, hottest function, and hottest line;
- a weighted source heatmap;
- LLVM IR output;
- LLVM/native or synthesized remarks;
- a function ranking panel with raw, weighted, block, instruction, and fallback counts.

The source heatmap should be read as "relative weighted energy per source
line." It is useful for spotting loop-nested or instruction-heavy code, but it
does not replace dynamic profiling for input-sensitive algorithms.

## Known Limitations

- The frequency model is static and loop-depth based. It does not know actual
  trip counts, branch probabilities, graph sizes, input data, cache behavior, or
  priority queue sizes.
- The analysis is intra-procedural. A call site pays the `call` bucket cost but
  does not include the full callee body unless optimization inlines it.
- Source attribution depends on debug locations. Optimizations can move,
  merge, or remove source locations.
- Costs are dimensionless ratios calibrated from published instruction-energy
  and optimization literature. Hardware measurement would be needed to claim
  physical joules.
- The backend currently parses function and line JSON records for the API.
  Block JSON records are emitted by the pass and used for remarks/reporting
  evolution, but they are not exposed as a first-class API list yet.
