"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  CircleDot,
  Diamond,
  FileOutput,
  Layers,
  Repeat2,
  Tags,
  Undo2,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { heatColor } from "@/lib/graph/heat";

/* ------------------------------------------------------------------ */
/* The algorithm inside EnergyAnalysisPass::runOnMachineFunction,      */
/* one node per step, with a synced explanation rail.                  */
/* ------------------------------------------------------------------ */

type StepKind = "entry" | "step" | "decision" | "loop" | "formula" | "emit";

type PassStep = {
  id: string;
  kind: StepKind;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Longer explanation shown in the rail. Absent for formula chips that are
   *  explained by their parent decision. */
  explain?: {
    label: string;
    body: string[];
    code?: string;
  };
};

const PASS_STEPS: PassStep[] = [
  {
    id: "entry",
    kind: "entry",
    icon: Zap,
    title: "runOnMachineFunction(MF)",
    subtitle: "called once per function",
    explain: {
      label: "Entry point",
      body: [
        "The pass is a legacy MachineFunctionPass registered as \"energy\" — llc hands it every machine function in the module, one at a time, after instruction selection has finished.",
        "Everything below happens per function. That is also why all results are 'per call of this function': the pass never sees the whole program at once.",
      ],
      code: `bool EnergyAnalysisPass::
    runOnMachineFunction(
      MachineFunction &MF)`,
    },
  },
  {
    id: "analyses",
    kind: "step",
    icon: Wrench,
    title: "Acquire LLVM analyses",
    subtitle: "MBFI · MachineLoopInfo · ORE",
    explain: {
      label: "Analysis dependencies",
      body: [
        "getAnalysisUsage() declares three required analyses, so the pass manager computes them first: MachineBlockFrequencyInfo (expected execution frequency of each block), MachineLoopInfo (loop depth and loop headers), and the remark emitter.",
        "It also calls setPreservesAll() — a promise to LLVM that this pass reads but never rewrites, so no analysis has to be recomputed after it.",
      ],
      code: `AU.addRequired<MachineBlockFrequencyInfo>();
AU.addRequired<MachineLoopInfo>();
AU.addRequired<MachineOptimizationRemarkEmitterPass>();
AU.setPreservesAll();`,
    },
  },
  {
    id: "model-choice",
    kind: "decision",
    icon: Diamond,
    title: "F.hasOptNone() ?",
    subtitle: "pick the frequency model",
    explain: {
      label: "Choose the frequency model",
      body: [
        "At -O0, clang marks every function optnone and SelectionDAG never runs branch-probability analysis — every branch would sit at a meaningless 50/50. The pass detects that and switches to the loop-depth heuristic: weight = 10^depth.",
        "Otherwise it trusts MachineBlockFrequencyInfo: weight = blockFreq(bb) / entryFreq, i.e. LLVM's own estimate of how often the block runs per call.",
        "The choice is recorded in the function record as frequencyModel, so every number downstream can be labeled honestly.",
      ],
      code: `hasBranchProbabilities =
  !MF.getFunction().hasOptNone();`,
    },
  },
  { id: "w-ld", kind: "formula", icon: Repeat2, title: "weight = 10 ^ loopDepth", subtitle: "yes → loop-depth fallback" },
  { id: "w-bf", kind: "formula", icon: CircleDot, title: "weight = blockFreq / entryFreq", subtitle: "no → block-frequency" },
  {
    id: "blocks",
    kind: "loop",
    icon: Layers,
    title: "for each MachineBasicBlock",
    subtitle: "weight · depth · successors",
    explain: {
      label: "Walk the blocks",
      body: [
        "Each basic block gets its frequency weight (from whichever model won above), its loop depth, a loop-header flag, and its successor list.",
        "That successor list is the machine control-flow graph — it is emitted verbatim in the block records, which is how the CFG view can redraw exactly what the pass saw.",
      ],
      code: `weight = MBFI.getBlockFreq(&BB)
         / entryFreq;
depth  = MLI.getLoopDepth(&BB);`,
    },
  },
  {
    id: "instrs",
    kind: "loop",
    icon: Repeat2,
    title: "for each MachineInstr",
    subtitle: "walk the block's instructions",
    explain: {
      label: "Walk the instructions",
      body: [
        "Inside each block, the pass visits every machine instruction in order. Each one will either be skipped as a meta-instruction or priced and accumulated — there is no third case.",
      ],
    },
  },
  {
    id: "meta",
    kind: "decision",
    icon: Diamond,
    title: "isMetaInstruction() ?",
    subtitle: "DBG_VALUE · KILL · CFI …",
    explain: {
      label: "Skip meta-instructions",
      body: [
        "DBG_VALUE, KILL, IMPLICIT_DEF and CFI_INSTRUCTION are bookkeeping — they emit no machine code into the binary, so they cost no energy.",
        "Skipping them matters: a -g build is littered with DBG_VALUEs, and counting them would inflate exactly the builds this tool is meant for.",
      ],
      code: `if (MI.isMetaInstruction())
  continue;  // costs nothing`,
    },
  },
  {
    id: "classify",
    kind: "step",
    icon: Tags,
    title: "EnergyModel::classify(MI)",
    subtitle: "alias → predicates → bucket + cost",
    explain: {
      label: "Price the instruction",
      body: [
        "The opcode name is looked up in the model's alias table first (~200 exact x86-64 opcodes). On a miss, LLVM's own predicates decide: isCall(), isBranch(), mayLoad(), mayStore(), then name heuristics for compares and FP/vector.",
        "The result is a bucket, its cost, and a fallback flag — the flag is counted per function, so you can always see how much of an estimate rests on heuristics instead of exact mappings.",
      ],
      code: `InstructionEnergy e =
  model.classify(MI);
// e.bucket, e.cost,
// e.usedDefaultFallback`,
    },
  },
  {
    id: "accumulate",
    kind: "step",
    icon: Zap,
    title: "Accumulate energy",
    subtitle: "raw += cost · weighted += cost × w",
    explain: {
      label: "Two totals, three scopes",
      body: [
        "Raw energy counts the instruction once — 'how expensive is one pass through this code'. Weighted energy multiplies by the block's frequency weight — 'how expensive is one call of this function'.",
        "Both totals accumulate at function scope and block scope simultaneously; the per-opcode weighted totals also feed each scope's topOpcodes list.",
      ],
      code: `raw      += e.cost;
weighted += e.cost * weight;`,
    },
  },
  {
    id: "dbg",
    kind: "step",
    icon: CircleDot,
    title: "Attribute to source line",
    subtitle: "via the DILocation, when present",
    explain: {
      label: "Project back onto the source",
      body: [
        "If the instruction still carries a DILocation (the -g metadata that survived lowering), its cost is also added to a (function, file, line, column) scope.",
        "These line scopes are what the source heatmap renders — the whole reason the pipeline compiles with -g and stops at finalize-isel, where debug info is still intact.",
        "Then the loops continue: next instruction, and when the block is exhausted, next block.",
      ],
      code: `if (const DILocation *loc =
      MI.getDebugLoc().get())
  lineScope[{fn, file,
    line, col}] += e;`,
    },
  },
  {
    id: "emit",
    kind: "emit",
    icon: FileOutput,
    title: "Emit records + remarks",
    subtitle: "[energy] JSON · YAML remarks",
    explain: {
      label: "Report everything",
      body: [
        "After the walk: one function record (totals, counts, frequencyModel), one block record per basic block (weights, successors, up to 40 classified instructions), and one line record per source location.",
        "In parallel it emits LLVM-native remarks — FunctionEnergy per function, HotBlock for every block with weight above 1 — so standard -pass-remarks tooling works too.",
      ],
      code: `errs() << "[energy] "
       << json::Value(record);
ORE.emit(FunctionEnergyRemark);`,
    },
  },
  {
    id: "return",
    kind: "step",
    icon: Undo2,
    title: "return false",
    subtitle: "MIR untouched",
    explain: {
      label: "Pure analysis",
      body: [
        "Returning false tells LLVM the pass changed nothing. Measuring the code never alters the code being measured — the same MIR could continue through the backend untouched.",
      ],
    },
  },
];

const EXPLAINED_STEPS = PASS_STEPS.filter((step) => step.explain);

/* ------------------------------ layout ------------------------------ */

const NODE_W = 260;
const NODE_H = 74;
const FORMULA_W = 250;
const FORMULA_H = 58;

const POSITIONS: Record<string, { x: number; y: number }> = {
  entry: { x: 0, y: 0 },
  analyses: { x: 0, y: 120 },
  "model-choice": { x: 0, y: 240 },
  "w-ld": { x: -300, y: 360 },
  "w-bf": { x: 310, y: 360 },
  blocks: { x: 0, y: 470 },
  instrs: { x: 0, y: 590 },
  meta: { x: 0, y: 710 },
  classify: { x: 0, y: 830 },
  accumulate: { x: 0, y: 950 },
  dbg: { x: 0, y: 1070 },
  emit: { x: 0, y: 1210 },
  return: { x: 0, y: 1330 },
};

type PassNodeData = { step: PassStep; isSelected: boolean; order: number };
type PassFlowNode = Node<PassNodeData, "passStep">;

function PassNodeView({ data }: NodeProps<PassFlowNode>) {
  const { step, isSelected, order } = data;
  const Icon = step.icon;
  const isFormula = step.kind === "formula";
  const hidden = "!size-1 !border-0 !bg-transparent !min-w-0 !min-h-0";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 transition-all duration-200",
        isFormula
          ? "border-dashed border-primary/40 bg-primary/5"
          : step.kind === "decision"
            ? "bg-card"
            : step.kind === "loop"
              ? "bg-card"
              : "bg-card",
        step.kind === "emit" && "shadow-[0_0_20px_-8px_var(--heat-3)]",
        step.kind === "entry" && "border-primary/60 shadow-[0_0_20px_-8px_var(--primary)]",
        isSelected
          ? "border-primary ring-2 ring-primary/40"
          : !isFormula && "border-border hover:border-primary/50",
        "cursor-pointer",
      )}
      style={{
        width: isFormula ? FORMULA_W : NODE_W,
        height: isFormula ? FORMULA_H : NODE_H,
        ...(step.kind === "decision" && !isSelected
          ? { borderColor: `color-mix(in oklch, ${heatColor(2)} 55%, var(--border))` }
          : {}),
        ...(step.kind === "emit" && !isSelected
          ? { borderColor: `color-mix(in oklch, ${heatColor(3)} 55%, var(--border))` }
          : {}),
      }}
    >
      <Handle id="t-top" type="target" position={Position.Top} className={hidden} />
      <Handle id="t-left" type="target" position={Position.Left} className={hidden} />
      <Handle id="t-right" type="target" position={Position.Right} className={hidden} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className={hidden} />
      <Handle id="s-left" type="source" position={Position.Left} className={hidden} />
      <Handle id="s-right" type="source" position={Position.Right} className={hidden} />

      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isFormula || step.kind === "entry"
            ? "bg-primary/15 text-primary"
            : step.kind === "loop"
              ? "bg-muted text-foreground"
              : "bg-muted text-muted-foreground",
        )}
        style={
          step.kind === "decision"
            ? { background: `color-mix(in oklch, ${heatColor(2)} 20%, transparent)`, color: heatColor(3) }
            : step.kind === "emit"
              ? { background: heatColor(3), color: "var(--background)" }
              : undefined
        }
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-mono text-[12px] font-semibold leading-tight",
            isFormula ? "text-primary" : "text-foreground",
          )}
        >
          {step.title}
        </p>
        <p className="truncate text-[10.5px] text-muted-foreground">{step.subtitle}</p>
      </div>
      {!isFormula && (
        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">
          {String(order + 1).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { passStep: PassNodeView };

const arrow = (color: string) => ({
  type: MarkerType.ArrowClosed,
  width: 15,
  height: 15,
  color,
});

function flowEdge(
  source: string,
  target: string,
  options: Partial<Edge> = {},
): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: "s-bottom",
    targetHandle: "t-top",
    type: "smoothstep",
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
    markerEnd: arrow("var(--muted-foreground)"),
    ...options,
  };
}

const label = (text: string) => ({
  label: text,
  labelStyle: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    fill: "var(--muted-foreground)",
  },
  labelBgStyle: { fill: "var(--background)", fillOpacity: 0.9 },
});

const PASS_EDGES: Edge[] = [
  flowEdge("entry", "analyses"),
  flowEdge("analyses", "model-choice"),
  flowEdge("model-choice", "w-ld", {
    sourceHandle: "s-left",
    targetHandle: "t-top",
    style: { stroke: heatColor(3), strokeWidth: 1.5 },
    markerEnd: arrow(heatColor(3)),
    ...label("yes · -O0"),
  }),
  flowEdge("model-choice", "w-bf", {
    sourceHandle: "s-right",
    targetHandle: "t-top",
    style: { stroke: "var(--primary)", strokeWidth: 1.5 },
    markerEnd: arrow("var(--primary)"),
    ...label("no"),
  }),
  flowEdge("w-ld", "blocks", {
    style: { stroke: heatColor(3), strokeWidth: 1.5, strokeDasharray: "4 4" },
    markerEnd: arrow(heatColor(3)),
  }),
  flowEdge("w-bf", "blocks", {
    style: { stroke: "var(--primary)", strokeWidth: 1.5, strokeDasharray: "4 4" },
    markerEnd: arrow("var(--primary)"),
  }),
  flowEdge("blocks", "instrs"),
  flowEdge("instrs", "meta"),
  flowEdge("meta", "classify", { ...label("no · real instruction") }),
  // Skip path: meta-instructions jump straight to the next instruction.
  flowEdge("meta", "instrs", {
    sourceHandle: "s-left",
    targetHandle: "t-left",
    animated: true,
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.2, strokeDasharray: "4 4" },
    ...label("yes · skip"),
  }),
  flowEdge("classify", "accumulate"),
  flowEdge("accumulate", "dbg"),
  // Loop-back edges: next instruction, then next block.
  flowEdge("dbg", "instrs", {
    sourceHandle: "s-right",
    targetHandle: "t-right",
    animated: true,
    style: { stroke: heatColor(4), strokeWidth: 1.4, strokeDasharray: "5 4" },
    markerEnd: arrow(heatColor(4)),
    ...label("next instruction ↺"),
  }),
  flowEdge("dbg", "blocks", {
    sourceHandle: "s-right",
    targetHandle: "t-right",
    animated: true,
    style: { stroke: heatColor(2), strokeWidth: 1.4, strokeDasharray: "5 4" },
    markerEnd: arrow(heatColor(2)),
    ...label("next block ↺"),
  }),
  flowEdge("dbg", "emit", { ...label("walk complete") }),
  flowEdge("emit", "return"),
];

/* ----------------------------- component ----------------------------- */

export function PassInternals() {
  const [selectedId, setSelectedId] = useState<string>("entry");

  const nodes = useMemo<Node[]>(
    () =>
      PASS_STEPS.map((step) => ({
        id: step.id,
        type: "passStep" as const,
        position: POSITIONS[step.id],
        data: {
          step,
          isSelected: step.id === selectedId,
          order: PASS_STEPS.indexOf(step),
        },
        draggable: false,
        connectable: false,
      })),
    [selectedId],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <div className="h-[520px] overflow-hidden rounded-2xl border border-border/60 bg-card/50 lg:h-[680px]">
        <ReactFlowProvider>
          <PassCanvas nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
        </ReactFlowProvider>
      </div>

      {/* Explanation rail, synced with the flowchart. */}
      <div className="flex max-h-[680px] flex-col gap-2 overflow-y-auto pr-1">
        {EXPLAINED_STEPS.map((step, index) => {
          const isActive = step.id === selectedId;
          const Icon = step.icon;
          return (
            <motion.button
              key={step.id}
              type="button"
              onClick={() => setSelectedId(step.id)}
              initial={{ opacity: 0, x: 14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-all",
                isActive
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/50 bg-card/50 hover:border-border",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <Icon className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-semibold text-foreground">
                  {step.explain!.label}
                </span>
                <span className="ml-auto hidden font-mono text-[10px] text-muted-foreground/70 xl:inline">
                  {step.title}
                </span>
              </div>

              {isActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-2.5">
                    {step.explain!.body.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-[13px] leading-relaxed text-muted-foreground"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {step.explain!.code && (
                      <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                        {step.explain!.code}
                      </pre>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function PassCanvas({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: Node[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const position = POSITIONS[selectedId];
    if (!position) return;
    const timer = window.setTimeout(() => {
      setCenter(position.x + NODE_W / 2, position.y + NODE_H / 2, {
        zoom: 0.95,
        duration: 600,
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [selectedId, setCenter]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={PASS_EDGES}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      fitView
      fitViewOptions={{ padding: 0.08 }}
      minZoom={0.25}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_event, node) => {
        // Formula chips explain the decision above them.
        const target = node.id === "w-ld" || node.id === "w-bf" ? "model-choice" : node.id;
        onSelect(target);
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
