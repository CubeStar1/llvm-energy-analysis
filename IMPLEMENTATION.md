# Implementation — LLVM Energy Analysis Pass

## Source files

| File | Role |
|---|---|
| `llvm-pass/src/EnergyAnalysisPass.cpp` | Pass entry point, MIR traversal, output emission |
| `llvm-pass/src/EnergyModel.cpp` | JSON model loader and instruction classifier |
| `llvm-pass/include/energy/EnergyAnalysisPass.h` | Pass class declaration |
| `llvm-pass/include/energy/EnergyModel.h` | `EnergyModel` and `InstructionEnergy` declarations |
| `llvm-pass/models/x86_64-energy-model.json` | Default instruction cost table |
| `llvm-pass/CMakeLists.txt` | Out-of-tree CMake build |

---

## Pass class

```cpp
class EnergyAnalysisPass final : public MachineFunctionPass {
public:
  static char ID;
  bool runOnMachineFunction(MachineFunction &machineFunction) override;
  void getAnalysisUsage(AnalysisUsage &analysisUsage) const override;
};
```

`MachineFunctionPass` is the LLVM legacy pass-manager base class for passes that operate on `MachineFunction` — the machine-level IR produced after instruction selection. `runOnMachineFunction` is called once per function in the module. The pass returns `false` (no modification) because it is a pure analysis.

### Registration

```cpp
INITIALIZE_PASS_BEGIN(EnergyAnalysisPass, "energy",
    "Machine-level energy estimation pass", false, true)
INITIALIZE_PASS_END(EnergyAnalysisPass, "energy",
    "Machine-level energy estimation pass", false, true)
```

The `INITIALIZE_PASS_*` macros register the pass under the name `"energy"` in LLVM's global pass registry. The final two booleans are `isCFGOnly=false` and `isAnalysis=true`. After registration, the pass can be invoked with `-run-pass=energy` when using `llc`.

The shared object also runs a static initializer that calls `initializeEnergyAnalysisPassPass` at load time:

```cpp
namespace {
struct RegisterEnergyAnalysisPass {
  RegisterEnergyAnalysisPass() {
    initializeEnergyAnalysisPassPass(*PassRegistry::getPassRegistry());
  }
} registerEnergyAnalysisPass;
}
```

This is the standard pattern for out-of-tree passes loaded via `-load`.

---

## Pipeline integration

The pass is inserted at a specific point in LLVM's codegen pipeline:

```
clang++ -g -O2 -S -emit-llvm source.cpp -o source.ll
llc-18 -O2 -stop-after=finalize-isel source.ll -o source.mir
llc-18 -load EnergyPass.so -run-pass=energy \
        -energy-model=models/x86_64-energy-model.json \
        source.mir -o /dev/null
```

`-stop-after=finalize-isel` stops the pipeline immediately after instruction selection is complete. The resulting `.mir` file contains real machine opcodes with DWARF debug locations attached. The second `llc` invocation loads the pass as a plugin and runs only the `energy` pass on that MIR. No object file is produced (`-o /dev/null`).

Why `finalize-isel` specifically: it is the earliest point where all instructions are concrete target opcodes and debug locations are still intact. Running later (e.g., after register allocation) is also valid but introduces pseudo-instructions and copy coalescing artefacts that inflate instruction counts.

---

## MIR traversal

```cpp
bool EnergyAnalysisPass::runOnMachineFunction(MachineFunction &machineFunction) {
  const energy::EnergyModel model =
      energy::EnergyModel::loadOrCreateDefault(EnergyModelPath);

  for (const MachineBasicBlock &block : machineFunction) {
    for (const MachineInstr &instruction : block) {
      const energy::InstructionEnergy ie = model.classify(instruction);
      // accumulate into block, function, and source-location summaries
      ...
      const DILocation *location = instruction.getDebugLoc().get();
      // if location != nullptr, contribute to sourceSummaries[{fn, file, line, col}]
    }
  }
  // emit JSON records
  return false;
}
```

Three parallel accumulators are maintained:

- **`FunctionSummary`** — one per `MachineFunction`; accumulates total raw/weighted energy and instruction counts.
- **`BlockSummary`** (one per `MachineBasicBlock`) — same per-block; records the first debug location found in the block.
- **`SourceLocationSummary`** (map keyed on `{function, file, line, column}`) — accumulates energy per unique source location; additionally tracks a per-opcode energy breakdown for `topOpcodes` reporting.

---

## Energy model

### Loading

`EnergyModel::loadOrCreateDefault(modelPath)` is called once per function invocation (the model is lightweight; the JSON is small). If the path is empty or unreadable, compiled-in defaults are used:

```
integer_alu: 1.0,  load: 2.0,  store: 2.2,
branch: 1.6,       call: 3.0,  compare: 1.2,
fp_or_vector_fallback: 2.8
```

The JSON model supports three top-level keys:
- `defaultFallbackCost` — cost for any instruction that does not match any alias or bucket heuristic.
- `opcodeBuckets` — map of bucket name → cost.
- `opcodeAliases` — map of exact opcode string → bucket name.

### Classification

```cpp
InstructionEnergy EnergyModel::classify(const MachineInstr &instruction) const {
  std::string opcodeName = instrInfo->getName(instruction.getOpcode()).str();

  // 1. Exact alias lookup
  if (auto it = OpcodeAliases.find(opcodeName); it != OpcodeAliases.end()) {
    return { lookupBucketCost(it->second), it->second, false };
  }

  // 2. Heuristic fallback
  std::string bucket = classifyFallbackBucket(instruction, opcodeName);
  double cost = lookupBucketCost(bucket);
  return { cost, bucket, /*usedDefaultFallback=*/... };
}
```

`classifyFallbackBucket` checks `MachineInstr` predicates in priority order:
1. `isCall()` → `call`
2. `isBranch()` → `branch`
3. `mayLoad()` → `load`
4. `mayStore()` → `store`
5. Opcode substring contains `CMP` or `TEST` → `compare`
6. Opcode substring contains `XMM`, `YMM`, `ZMM`, `MMX`, `FP`, `FADD`, `FMUL`, `FDIV` → `fp_or_vector_fallback`
7. Default → `integer_alu`

The `usedDefaultFallback` flag is true only if the looked-up bucket is not in `BucketCosts` at all (which cannot happen for the heuristic path since all seven buckets are always populated, but matters for extensibility). The backend counts mapped vs. fallback instructions from this flag.

---

## Output format

Each record is a single JSON object on a line prefixed with `[energy] `:

```
[energy] {"kind":"function","function":"_Z3fooii","rawEnergy":14.2,
  "weightedEnergy":14.2,"blockCount":3,"instructionCount":12,
  "mappedInstructionCount":10,"fallbackInstructionCount":2}

[energy] {"kind":"block","function":"_Z3fooii","block":"entry",
  "rawEnergy":4.6,"weightedEnergy":4.6,"frequencyWeight":1.0,
  "instructionCount":4,"mappedInstructionCount":4,"fallbackInstructionCount":0,
  "file":"/tmp/foo.cpp","line":3,"column":1}

[energy] {"kind":"line","function":"_Z3fooii","file":"/tmp/foo.cpp",
  "line":5,"column":3,"rawEnergy":2.0,"weightedEnergy":2.0,
  "instructionCount":1,"topOpcodes":["MOV64rm"]}
```

All float values are rounded to 6 decimal places before emission using:

```cpp
double roundTo(double value, unsigned places = 6) {
  const double scale = std::pow(10.0, static_cast<double>(places));
  return std::round(value * scale) / scale;
}
```

`topOpcodes` is the sorted list of up to three opcodes with the highest weighted energy contribution at that source location.

---

## Debug location extraction

```cpp
std::string getSourceFilePath(const DILocation *location) {
  std::string filename = location->getFilename().str();
  const std::string directory = location->getDirectory().str();
  if (!directory.empty() && !sys::path::is_absolute(filename)) {
    SmallString<256> path(directory);
    sys::path::append(path, filename);
    return std::string(path.str());
  }
  return filename;
}
```

DWARF `DILocation` nodes carry a filename and a compilation directory. If the filename is relative (which it is for files compiled with a relative path), the directory is prepended to produce an absolute path. This ensures consistent keying in `sourceSummaries` even if the compilation was run from a different working directory.

Instructions without a valid `DILocation` (line == 0 or location == nullptr) still contribute to block and function energy but are excluded from source-line annotations.

---

## Backend pipeline (Python)

### `CompilerService` (`services/compiler.py`)

Orchestrates two subprocesses:

1. `clang++-18 source.cpp -g -O2 -S -emit-llvm -o workspace/input.ll`
2. `llc-18 -O2 -stop-after=finalize-isel workspace/input.ll -o workspace/input.mir`
3. `llc-18 -load EnergyPass.so -run-pass=energy -energy-model=... workspace/input.mir -o /dev/null`

Steps 2 and 3 are sequential (step 3 consumes step 2's output). Step 3's `stderr` is captured and passed to `parse_energy_pass_output`.

Each analysis runs in a `tempfile.TemporaryDirectory` (`services/workspace.py`) so concurrent requests are isolated.

### `parse_energy_pass_output` (`parsers/energy.py`)

Iterates lines of stderr. Lines starting with `[energy] ` and containing a `{` are parsed as JSON. Records are dispatched by `kind` into `ParsedEnergyReport.functions` or `ParsedEnergyReport.source_annotations`. Functions and annotations are sorted by `weighted_energy` descending before being returned.

### `AnalyzerService` (`services/analyzer.py`)

Converts `ParsedEnergyReport` to the Pydantic `AnalyzeResponse` schema consumed by the frontend. Also synthesizes `Remark` objects from energy data when no YAML remarks file is present (the fallback path).

---

## Build system

The pass uses out-of-tree CMake, the standard LLVM plugin build pattern:

```cmake
find_package(LLVM REQUIRED CONFIG)
list(APPEND CMAKE_MODULE_PATH "${LLVM_CMAKE_DIR}")
include(AddLLVM)
include(HandleLLVMOptions)

add_library(EnergyPass MODULE
  src/EnergyAnalysisPass.cpp
  src/EnergyModel.cpp
)
target_include_directories(EnergyPass PRIVATE ${LLVM_INCLUDE_DIRS} include)
target_compile_definitions(EnergyPass PRIVATE ${LLVM_DEFINITIONS})
llvm_map_components_to_libnames(LIBS Core CodeGen Remarks Support TransformUtils)
target_link_libraries(EnergyPass PRIVATE LLVM)   # or ${LIBS} if no monolithic LLVM
```

`find_package(ZLIB REQUIRED)` is listed first to ensure `ZLIB::ZLIB` is resolved before LLVM's exported targets reference it — a known issue with LLVM 18's CMake exports on Ubuntu.

`CMAKE_EXPORT_COMPILE_COMMANDS ON` produces `build/compile_commands.json` for IDE tooling.
