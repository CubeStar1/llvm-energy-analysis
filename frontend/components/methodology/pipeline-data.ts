import type { LucideIcon } from "lucide-react";
import {
  Binary,
  Braces,
  Code2,
  Cpu,
  Database,
  FileCode2,
  FileText,
  LayoutDashboard,
  Terminal,
  Zap,
} from "lucide-react";

/** Visual role of a pipeline node — each kind gets its own styling. */
export type PipelineNodeKind = "artifact" | "tool" | "pass" | "output" | "app";

export type PipelineLane = "compile" | "analyze" | "serve";

export type PipelineStage = {
  id: string;
  kind: PipelineNodeKind;
  lane: PipelineLane;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** One-line summary shown inside the flow node. */
  blurb: string;
  detail: {
    heading: string;
    points: string[];
    code?: {
      label: string;
      content: string;
    };
  };
};

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "source",
    kind: "artifact",
    lane: "compile",
    icon: Code2,
    title: "C/C++ Source",
    subtitle: "main.cpp",
    blurb: "The program under analysis",
    detail: {
      heading: "It starts with plain source code",
      points: [
        "Any C/C++ translation unit, plus a chosen standard and optimization level — the two knobs that change everything downstream.",
        "Nothing is ever executed. Every number this tool produces is derived purely from the instructions the compiler would generate.",
        "That is the core idea of static analysis: the compiler already knows what the CPU will be asked to do — we just have to read it.",
      ],
      code: {
        label: "testcases/02_loop_hotspot.cpp",
        content: `int main() {
    int total = 0;
    for (int i = 0; i < 1000; ++i) {
        total += i * 3;
    }
    return total;
}`,
      },
    },
  },
  {
    id: "clang",
    kind: "tool",
    lane: "compile",
    icon: Terminal,
    title: "clang++ Frontend",
    subtitle: "-g -S -emit-llvm",
    blurb: "Parse, typecheck, lower to IR",
    detail: {
      heading: "clang++ lowers source to LLVM IR",
      points: [
        "clang parses and type-checks the source, then emits textual LLVM IR instead of an object file (-S -emit-llvm).",
        "-g attaches DILocation debug metadata to every instruction — the thread that lets us map machine instructions back to file, line, and column later.",
        "Optimization level matters here: -O2 produces tight, transformed IR, while -O0 marks every function optnone — which changes the frequency model downstream.",
      ],
      code: {
        label: "stage 1 of 3",
        content: `clang++-18 main.cpp -std=c++20 \\
  -g -S -emit-llvm -O0 \\
  -o input.ll`,
      },
    },
  },
  {
    id: "ir",
    kind: "artifact",
    lane: "compile",
    icon: FileCode2,
    title: "LLVM IR",
    subtitle: "input.ll",
    blurb: "SSA, target-independent",
    detail: {
      heading: "LLVM IR is too abstract to cost",
      points: [
        "LLVM IR is portable SSA: it only knows abstract operations like add, load, and br — with no idea what the target CPU will actually execute.",
        "An abstract add could become one cheap register instruction or several — so we keep lowering instead of costing energy here.",
        "This is exactly why the analysis does NOT stop at IR: instruction-mix energy analysis needs real target opcodes.",
      ],
      code: {
        label: "input.ll · loop body",
        content: `for.body:
  %1 = load i32, ptr %i,  !dbg !23
  %mul = mul nsw i32 %1, 3, !dbg !25
  %2 = load i32, ptr %total, !dbg !26
  %add = add nsw i32 %2, %mul
  store i32 %add, ptr %total
  br label %for.inc, !dbg !27`,
      },
    },
  },
  {
    id: "llc",
    kind: "tool",
    lane: "compile",
    icon: Cpu,
    title: "llc Instruction Selection",
    subtitle: "-stop-after=finalize-isel",
    blurb: "Lower IR to target opcodes",
    detail: {
      heading: "llc lowers IR to Machine IR — and stops",
      points: [
        "SelectionDAG picks real x86-64 opcodes for every abstract operation and lays out machine basic blocks.",
        "We stop right after finalize-isel: the sweet spot where target opcodes exist and DILocation debug info is still attached.",
        "Unless the function is optnone, this stage also computes branch probabilities — fuel for the frequency weighting later.",
      ],
      code: {
        label: "stage 2 of 3",
        content: `llc-18 -O0 \\
  -stop-after=finalize-isel \\
  input.ll -o input.mir`,
      },
    },
  },
  {
    id: "mir",
    kind: "artifact",
    lane: "compile",
    icon: Binary,
    title: "Machine IR",
    subtitle: "input.mir",
    blurb: "Target opcodes + debug locs",
    detail: {
      heading: "Machine IR: what the CPU would really run",
      points: [
        "MIR distinguishes ADD64rr from MOV64rm from JCC_1 — where LLVM IR only saw add, load, and br. That distinction is what makes an instruction-mix energy model meaningful.",
        "Each machine basic block lists its successors — this is the control-flow graph the CFG tab renders.",
        "Every instruction still carries its debug-location, pointing at the original source line.",
      ],
      code: {
        label: "input.mir · loop body (trimmed)",
        content: `bb.2.for.body:
  %2:gr32 = MOV32rm %stack.1.i      ; load i
  %3:gr32 = IMUL32rri %2, 3         ; i * 3
  %4:gr32 = MOV32rm %stack.0.total  ; load total
  %5:gr32 = ADD32rr %4, %3          ; total + i*3
  MOV32mr %stack.0.total, %5        ; store total
  JMP_1 %bb.3, debug-location !26`,
      },
    },
  },
  {
    id: "model",
    kind: "artifact",
    lane: "analyze",
    icon: Database,
    title: "Energy Model",
    subtitle: "x86_64-energy-model.json",
    blurb: "Bucket costs + opcode aliases",
    detail: {
      heading: "Costs live in JSON, not in C++",
      points: [
        "Seven cost buckets, with integer ALU as the 1.0 baseline. Ratios are calibrated against Agner Fog's instruction tables and Intel's optimization manual — designed to preserve ordering, not measure joules.",
        "An expanded alias table maps ~200 exact x86-64 opcodes straight to buckets; everything else falls through to LLVM instruction predicates.",
        "Swapping this file for the AArch64 model retargets the analysis — the pass itself stays target-agnostic.",
      ],
      code: {
        label: "model v4 · bucket costs",
        content: `"opcodeBuckets": {
  "integer_alu": 1.0,
  "compare":     1.2,
  "branch":      1.6,
  "load":        2.0,
  "store":       2.2,
  "fp_or_vector_fallback": 2.8,
  "call":        3.0
}`,
      },
    },
  },
  {
    id: "pass",
    kind: "pass",
    lane: "analyze",
    icon: Zap,
    title: "EnergyPass.so",
    subtitle: "llc -run-pass=energy",
    blurb: "The custom MachineFunctionPass",
    detail: {
      heading: "The heart: a custom out-of-tree MachineFunctionPass",
      points: [
        "Loaded into a second llc invocation with -load / -run-pass=energy. It requires three LLVM analyses: MachineBlockFrequencyInfo, MachineLoopInfo, and the optimization-remark emitter.",
        "For every machine instruction it skips meta-instructions (DBG_VALUE, CFI — they emit no machine code), classifies the opcode into a bucket, and accumulates raw energy (cost) and weighted energy (cost × block frequency).",
        "Totals are kept at three scopes simultaneously: per function, per basic block, and per source line (via each instruction's DILocation).",
        "It returns false — pure analysis, the MIR is never mutated.",
      ],
      code: {
        label: "stage 3 of 3",
        content: `llc-18 -load EnergyPass.so \\
  -run-pass=energy \\
  -energy-model=x86_64-energy-model.json \\
  -pass-remarks-analysis=energy \\
  -pass-remarks-output=energy-remarks.yaml \\
  input.mir -o /dev/null`,
      },
    },
  },
  {
    id: "json",
    kind: "output",
    lane: "analyze",
    icon: Braces,
    title: "[energy] JSON Lines",
    subtitle: "stderr",
    blurb: "function · block · line records",
    detail: {
      heading: "Primary channel: JSON records on stderr",
      points: [
        "Three record kinds: function (totals + frequency model), block (energy, frequency weight, successors, instructions), and line (source-attributed totals + top opcodes).",
        "Block records ARE the control-flow graph: number + successors, straight from the machine CFG. Instructions are capped at 40 per block to bound payload size.",
        "Newline-delimited JSON with a stable [energy] prefix — any tool can consume the analysis without touching LLVM internals.",
      ],
      code: {
        label: "one record per line",
        content: `[energy] {"kind":"line",
  "function":"main",
  "file":"main.cpp","line":4,
  "rawEnergy":9.8,
  "weightedEnergy":98.0,
  "instructionCount":6,
  "topOpcodes":["MOV32rm","IMUL32rri"]}`,
      },
    },
  },
  {
    id: "yaml",
    kind: "output",
    lane: "analyze",
    icon: FileText,
    title: "Optimization Remarks",
    subtitle: "energy-remarks.yaml",
    blurb: "LLVM-native diagnostics",
    detail: {
      heading: "Secondary channel: LLVM remarks",
      points: [
        "The pass also speaks LLVM's own remark dialect: a FunctionEnergy remark per function and a HotBlock remark for every block with frequency weight above 1.",
        "Emitted through -pass-remarks-analysis=energy into YAML — so any tool that already understands LLVM remarks can consume the analysis.",
        "If YAML is unavailable, the backend synthesizes equivalent remarks from the JSON records, so the remarks table never comes up empty.",
      ],
      code: {
        label: "energy-remarks.yaml",
        content: `--- !Analysis
Pass:     energy
Name:     FunctionEnergy
Function: main
Args:
  - Function: main
  - WeightedEnergy: '203.0'
  - RawEnergy: '28.4'`,
      },
    },
  },
  {
    id: "report",
    kind: "app",
    lane: "serve",
    icon: LayoutDashboard,
    title: "Energy Report",
    subtitle: "heatmap · CFG · ranking",
    blurb: "Where the numbers land",
    detail: {
      heading: "The records become pictures",
      points: [
        "Line records paint the source heatmap — weighted energy per line, the fastest hotspot signal.",
        "Block records carry number + successors, so the machine CFG can be reconstructed and heat-colored exactly as the pass saw it, back edges and all.",
        "Function records drive the ranking, and expose both totals — weighted separates 'hot because of a loop' from raw's 'hot because of expensive instructions'.",
        "Every view is a different projection of the same [energy] records — no extra analysis happens outside the pass.",
      ],
    },
  },
];

export const STAGE_ORDER = PIPELINE_STAGES.map((stage) => stage.id);

export function getStage(id: string): PipelineStage | undefined {
  return PIPELINE_STAGES.find((stage) => stage.id === id);
}
