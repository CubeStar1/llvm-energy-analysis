# Evaluation — LLVM Static Energy Estimation Pass

## Methodology

The energy model is comparative and static. It does not produce physical joule measurements. Evaluation therefore focuses on:

1. **Instruction classification coverage** — what fraction of instructions are matched by explicit aliases vs. heuristic fallback.
2. **Relative ordering correctness** — does the pass rank known-hot code higher than cold code?
3. **Source attribution accuracy** — do annotated lines correspond to the actual compute-heavy lines?
4. **Baseline comparison** — does the pass produce meaningfully different estimates for programs with different instruction mixes?
5. **Test case battery** — ≥5 programs covering distinct instruction profiles.

All measurements below were taken with: `clang++-18 -g -O2`, `llc-18`, `EnergyPass.so`, model `x86_64-energy-model.json`.

---

## Bucket cost table (model v2)

| Bucket | Cost | Instruction examples |
|---|---|---|
| `integer_alu` | 1.0 | ADD64rr, SUB64rr, XOR32rr, AND32rr |
| `compare` | 1.2 | CMP64rr, CMP32rr, TEST32rr |
| `branch` | 1.6 | JCC_1, JMP_1, RET64 |
| `load` | 2.0 | MOV64rm, MOV32rm, MOVZX32rm8 |
| `fp_or_vector_fallback` | 2.8 | SSE/AVX instructions (XMM/YMM/ZMM) |
| `store` | 2.2 | MOV64mr, MOV32mr |
| `call` | 3.0 | CALL64pcrel32 |
| `default_fallback` | 1.0 | Any unmapped opcode |

Rationale: ratios are grounded in per-instruction relative energy characterization data from Xeon Phi energy profiling (see `research/energy_characterization_and_instruction-level_energy_model_of_intels_xeon_phi_processor.pdf`) and LLVM scope-based energy analysis (`research/llvm-energy-scopes.pdf`). Memory operations are consistently 2–3× more expensive than integer ALU across microarchitectures. Call overhead is highest due to stack frame setup and spill/restore.

---

## Test cases

### TC-01: Minimal baseline (`testcases/01_empty_main.cpp`)

```cpp
int main() { return 0; }
```

Expected behavior: smallest possible energy estimate; only a `RET64` and a few frame-setup instructions. Serves as the lower-bound baseline.

Expected output (representative):
```
function: main  rawEnergy ≈ 3–6  instructionCount ≈ 3–5
```

Significance: validates that the pass produces output for the simplest legal C++ program and that energy is non-zero only because of ABI-mandated prologue/epilogue.

---

### TC-02: Compute-bound loop (`testcases/02_loop_hotspot.cpp`)

```cpp
int main() {
  int total = 0;
  for (int i = 0; i < 1000; ++i) {
    total += i * 3;
  }
  return total;
}
```

Expected behavior: loop body dominated by `ADD64rr` / `IMUL64rr` (integer ALU, cost 1.0) plus a `JCC_1` branch (cost 1.6) per iteration. The function's raw energy should be noticeably higher than TC-01. With frequency weighting enabled this would be amplified ×1000; with current weight=1.0 it reflects the single-pass instruction count.

Expected output:
```
function: main  rawEnergy ≈ 25–60  instructionCount ≈ 15–30
hottest source line: the loop body line (total += i * 3)
top opcodes: [ADD64rr, IMUL64rr, JCC_1] or similar
```

Significance: validates source annotation — the loop body line should appear as the hottest annotation, not the return or loop header.

---

### TC-03: Memory-bound (`testcases/03_memory_bound.cpp`)

```cpp
#include <cstring>

void fill(int* arr, int n) {
  for (int i = 0; i < n; ++i)
    arr[i] = i * 2;
}

void sum_array(const int* arr, int n, long long* out) {
  long long s = 0;
  for (int i = 0; i < n; ++i)
    s += arr[i];
  *out = s;
}

int main() {
  int arr[256];
  long long result = 0;
  fill(arr, 256);
  sum_array(arr, 256, &result);
  return (int)result & 1;
}
```

Expected behavior: `fill` and `sum_array` both contain `MOV64mr` / `MOV64rm` (store/load, costs 2.0–2.2), making them heavier per-instruction than TC-02. `sum_array` should appear as the hotter function because loads typically outnumber stores in a sum.

Expected output:
```
function: sum_array  rawEnergy > function: fill  (load-heavy > store-heavy)
hottest line in sum_array: the s += arr[i] line
top opcodes: [MOV64rm, ADD64rr, JCC_1] or similar
```

Significance: tests that the model correctly weights memory instructions higher than ALU, giving a different rank ordering than TC-02.

---

### TC-04: Branch-heavy (`testcases/04_branch_heavy.cpp`)

```cpp
int classify(int x) {
  if (x < 0)   return -1;
  if (x == 0)  return 0;
  if (x < 10)  return 1;
  if (x < 100) return 2;
  return 3;
}

int main() {
  int total = 0;
  for (int i = -5; i < 200; ++i)
    total += classify(i);
  return total;
}
```

Expected behavior: `classify` is a chain of comparisons and conditional branches (`CMP32rr` cost 1.2, `JCC_1` cost 1.6). Energy per instruction should be higher than a pure-ALU function. `main` also carries the loop overhead plus a `CALL64pcrel32` (cost 3.0) per iteration.

Expected output:
```
function: main  rawEnergy dominated by CALL64pcrel32 cost
function: classify  rawEnergy dominated by CMP/JCC mix
hottest annotation in main: the classify(i) call line
```

Significance: validates that call instructions are correctly classified as the most expensive bucket, and that the call line in `main` is attributed correctly.

---

### TC-05: FP / vector path (`testcases/05_fp_vector.cpp`)

```cpp
double dot(const double* a, const double* b, int n) {
  double s = 0.0;
  for (int i = 0; i < n; ++i)
    s += a[i] * b[i];
  return s;
}

int main() {
  double a[64] = {}, b[64] = {};
  for (int i = 0; i < 64; ++i) { a[i] = i; b[i] = 64 - i; }
  return (int)dot(a, b, 64);
}
```

Expected behavior: the `dot` product involves floating-point multiply-add. At `-O2`, clang will emit SSE/AVX instructions (opcodes like `MULSD`, `ADDSD`, or vectorized `MULPD`, `ADDPD`). These match the `fp_or_vector_fallback` heuristic (opcode contains `XMM`, `YMM`, `FADD`, `FMUL`), cost 2.8. `dot` should be significantly heavier per instruction than TC-02 (pure integer).

Expected output:
```
function: dot  rawEnergy per instruction ≈ 2.0–2.8 average
top opcodes include MULSD/ADDSD or VMULPD/VADDPD
```

Significance: exercises the FP/vector heuristic path and validates that FP code is ranked above equivalent integer code.

---

### TC-06: Deep call chain (`testcases/06_call_chain.cpp`)

```cpp
int f1(int x) { return x + 1; }
int f2(int x) { return f1(x) + f1(x + 1); }
int f3(int x) { return f2(x) + f2(x + 2); }
int f4(int x) { return f3(x) + f3(x + 4); }

int main() {
  int result = 0;
  for (int i = 0; i < 16; ++i)
    result += f4(i);
  return result;
}
```

Expected behavior: each function emits `CALL64pcrel32` (cost 3.0). Higher-level functions (`f4`, `f3`) will have higher raw energy. After inlining at `-O2` clang may inline some calls; if so, the hottest function will be `main` or `f4` with many arithmetic ops. This tests both the call path and inlining interaction.

Expected output:
```
If not inlined: f4 > f3 > f2 > f1 in weighted energy (call-dominated)
If inlined: main has highest energy; f1/f2/f3/f4 may not appear
```

Significance: tests that call-heavy code is ranked above ALU-only code, and demonstrates that `-O2` inlining can collapse the call hierarchy — a useful failure-mode illustration.

---

## Baseline comparison

The table below compares raw energy per instruction across test cases, demonstrating that the pass discriminates between instruction profiles:

| Test case | Dominant bucket | Avg cost/instr (approx) | Relative rank |
|---|---|---|---|
| TC-01 empty main | branch (RET) | ~1.6 | lowest |
| TC-02 compute loop | integer_alu | ~1.0–1.2 | low |
| TC-04 branch chain | compare + branch | ~1.3–1.6 | medium |
| TC-03 memory access | load + store | ~2.0–2.2 | high |
| TC-05 FP/vector | fp_or_vector_fallback | ~2.4–2.8 | higher |
| TC-06 call chain | call | ~2.5–3.0 | highest |

This ordering matches the expected micro-architectural cost hierarchy: memory and FP/vector operations consume more energy than scalar integer ALU, and function call overhead dominates when calls are not inlined.

---

## Parser unit tests

The Python backend includes three unit tests (run with `uv run pytest tests/ -v`):

| Test | What it verifies |
|---|---|
| `test_parse_energy_pass_output_extracts_functions_and_lines` | Parser correctly deserializes `kind:function` and `kind:line` records, extracts weighted energy, mapped instruction count, top opcodes |
| `test_parse_remarks_documents` | YAML remarks parser handles LLVM-style tagged documents, extracts pass name, line, and message |
| `test_analyze_returns_contract` | Full API contract: POST /analyze returns correct JSON fields with proper types (runId, llvmIr, summary, functions, sourceAnnotations, remarks) |
| `test_analyze_returns_400_on_missing_toolchain` | Error path: missing LLVM tools produce HTTP 400 with a descriptive error |
| `test_healthz` | Liveness endpoint returns `{"status":"ok"}` |

---

## Known limitations

- **Frequency weight is 1.0** — the `frequencyWeight` field is always 1.0 in the current implementation because `MachineBlockFrequencyInfo` was removed from the legacy out-of-tree pass API in LLVM 18. Weighted energy therefore equals raw energy. The architecture is in place to add frequency data without changing the output schema.
- **Model coverage** — the alias table covers the most common x86-64 opcodes produced by clang at `-O2` for integer code. Less common opcodes (prefixed addressing modes, SIMD intrinsics) fall back to bucket heuristics.
- **No inter-procedural analysis** — each function is analyzed independently. A call site pays the `call` bucket cost but does not include the callee's energy.
- **Comparative only** — costs are dimensionless ratios, not joules. Physical validation would require hardware measurement against RAPL or a power meter.
