"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Binary,
  Braces,
  Code2,
  FileCode2,
  Flame,
  Scale,
  Tags,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heatColor, type HeatLevel } from "@/lib/graph/heat";

/* ------------------------------------------------------------------ */
/* Worked example: testcases/02_loop_hotspot.cpp at -O0.               */
/* Numbers are illustrative but follow the real model arithmetic:      */
/* raw = Σ cost, weighted = raw × frequency weight (10^depth at -O0).  */
/* ------------------------------------------------------------------ */

const SOURCE_LINES = [
  "int main() {",
  "    int total = 0;",
  "    for (int i = 0; i < 1000; ++i) {",
  "        total += i * 3;",
  "    }",
  "    return total;",
  "}",
];

type ClassifiedInstruction = {
  opcode: string;
  meaning: string;
  bucket: string;
  cost: number;
  matchedBy: "alias" | "predicate";
};

const LOOP_BODY_INSTRUCTIONS: ClassifiedInstruction[] = [
  { opcode: "MOV32rm", meaning: "load i", bucket: "load", cost: 2.0, matchedBy: "alias" },
  { opcode: "IMUL32rri", meaning: "i * 3", bucket: "integer_alu", cost: 1.0, matchedBy: "alias" },
  { opcode: "MOV32rm", meaning: "load total", bucket: "load", cost: 2.0, matchedBy: "alias" },
  { opcode: "ADD32rr", meaning: "total + i*3", bucket: "integer_alu", cost: 1.0, matchedBy: "alias" },
  { opcode: "MOV32mr", meaning: "store total", bucket: "store", cost: 2.2, matchedBy: "alias" },
  { opcode: "JMP_1", meaning: "jump to for.inc", bucket: "branch", cost: 1.6, matchedBy: "predicate" },
];

type BlockRow = {
  name: string;
  role: string;
  depth: number;
  weight: number;
  raw: number;
  weighted: number;
  heat: HeatLevel;
};

const BLOCK_ROWS: BlockRow[] = [
  { name: "%bb.0", role: "entry", depth: 0, weight: 1, raw: 5.4, weighted: 5.4, heat: 1 },
  { name: "%bb.1", role: "for.cond", depth: 1, weight: 10, raw: 2.8, weighted: 28.0, heat: 2 },
  { name: "%bb.2", role: "for.body", depth: 1, weight: 10, raw: 9.8, weighted: 98.0, heat: 4 },
  { name: "%bb.3", role: "for.inc", depth: 1, weight: 10, raw: 6.8, weighted: 68.0, heat: 3 },
  { name: "%bb.4", role: "for.end", depth: 0, weight: 1, raw: 3.6, weighted: 3.6, heat: 1 },
];

type HeatmapLine = { line: number; text: string; weighted: number | null; heat: HeatLevel };

const HEATMAP_LINES: HeatmapLine[] = [
  { line: 1, text: "int main() {", weighted: null, heat: 0 },
  { line: 2, text: "    int total = 0;", weighted: 2.2, heat: 1 },
  { line: 3, text: "    for (int i = 0; i < 1000; ++i) {", weighted: 96.0, heat: 3 },
  { line: 4, text: "        total += i * 3;", weighted: 98.0, heat: 4 },
  { line: 5, text: "    }", weighted: null, heat: 0 },
  { line: 6, text: "    return total;", weighted: 3.6, heat: 1 },
  { line: 7, text: "}", weighted: null, heat: 0 },
];

const BUCKET_STYLE: Record<string, { heat: HeatLevel }> = {
  integer_alu: { heat: 1 },
  compare: { heat: 1 },
  branch: { heat: 2 },
  load: { heat: 3 },
  store: { heat: 3 },
  call: { heat: 4 },
  fp_or_vector_fallback: { heat: 4 },
};

function BucketChip({ bucket, cost }: { bucket: string; cost?: number }) {
  const heat = BUCKET_STYLE[bucket]?.heat ?? 1;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-px font-mono text-[10px]"
      style={{
        borderColor: `color-mix(in oklch, ${heatColor(heat)} 55%, var(--border))`,
        background: `color-mix(in oklch, ${heatColor(heat)} 14%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: heatColor(heat) }} />
      {bucket}
      {cost !== undefined && <span className="text-muted-foreground">· {cost.toFixed(1)}</span>}
    </span>
  );
}

function CodeCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/60 bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
      </div>
      <div className="overflow-x-auto p-3.5 font-mono text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

/* ------------------------------- steps ------------------------------- */

type Step = {
  id: string;
  icon: LucideIcon;
  label: string;
  tag: string;
  heading: string;
  narrative: string[];
  render: () => React.ReactNode;
};

const STEPS: Step[] = [
  {
    id: "src",
    icon: Code2,
    label: "Source",
    tag: "main.cpp",
    heading: "A tiny program with an obvious suspect",
    narrative: [
      "Seven lines of C++: a loop that runs 1000 times, multiplying and accumulating. Any developer can guess line 4 is the hotspot — the question is whether a purely static pipeline can prove it, with numbers, without ever running the program.",
      "Keep an eye on line 4. We will follow it all the way down to machine instructions and back.",
    ],
    render: () => (
      <CodeCard label="testcases/02_loop_hotspot.cpp">
        {SOURCE_LINES.map((text, index) => (
          <div key={index} className={cn("flex gap-4 px-1", index === 3 && "rounded bg-primary/10")}>
            <span className="w-4 select-none text-right text-muted-foreground/60">{index + 1}</span>
            <span className={cn(index === 3 && "font-semibold text-primary")}>{text}</span>
          </div>
        ))}
      </CodeCard>
    ),
  },
  {
    id: "ir",
    icon: FileCode2,
    label: "LLVM IR",
    tag: "clang++ -g -S -emit-llvm",
    heading: "clang++ lowers it — and tags every op with !dbg",
    narrative: [
      "The loop becomes five basic blocks in SSA form. Note the !dbg metadata on each instruction: that is the -g debug location, and it is the only reason we can later say \"this machine instruction came from line 4\".",
      "But IR operations are abstract — a load here says nothing about what the CPU pays for it. So we keep lowering.",
    ],
    render: () => (
      <CodeCard label="input.ll · for.body (line 4)">
        <div className="text-muted-foreground">
          <div>for.body:</div>
          <div>
            {"  %1 = load i32, ptr %i, "}
            <span className="text-primary">!dbg !23</span>
          </div>
          <div className="rounded bg-primary/10 px-1 -mx-1">
            {"  %mul = mul nsw i32 %1, 3, "}
            <span className="text-primary">!dbg !25</span>
          </div>
          <div>{"  %2 = load i32, ptr %total"}</div>
          <div className="rounded bg-primary/10 px-1 -mx-1">
            {"  %add = add nsw i32 %2, %mul"}
          </div>
          <div>{"  store i32 %add, ptr %total"}</div>
          <div>{"  br label %for.inc"}</div>
        </div>
      </CodeCard>
    ),
  },
  {
    id: "mir",
    icon: Binary,
    label: "Machine IR",
    tag: "llc -stop-after=finalize-isel",
    heading: "Now we see real x86-64 opcodes",
    narrative: [
      "After instruction selection the abstract ops are gone: line 4 is now MOV32rm (a memory read), IMUL32rri (a multiply), ADD32rr, MOV32mr (a memory write). This is the level where an instruction-mix energy model makes sense.",
      "We stop right after finalize-isel because it is the sweet spot: target opcodes exist, and every instruction still carries its debug-location.",
    ],
    render: () => (
      <CodeCard label="input.mir · bb.2.for.body">
        <div className="text-muted-foreground">
          <div>bb.2.for.body:</div>
          {[
            ["MOV32rm", "%stack.1.i", "; load i"],
            ["IMUL32rri", "%2, 3", "; i * 3"],
            ["MOV32rm", "%stack.0.total", "; load total"],
            ["ADD32rr", "%4, %3", "; total + i*3"],
            ["MOV32mr", "%stack.0.total, %5", "; store total"],
            ["JMP_1", "%bb.3", "; → for.inc"],
          ].map(([opcode, operands, comment], index) => (
            <div key={index} className="flex gap-2">
              <span className="w-24 shrink-0 font-semibold text-foreground">{opcode}</span>
              <span className="min-w-32">{operands}</span>
              <span className="text-muted-foreground/60">
                {comment} <span className="text-primary/80">debug-location L4</span>
              </span>
            </div>
          ))}
        </div>
      </CodeCard>
    ),
  },
  {
    id: "classify",
    icon: Tags,
    label: "Classify",
    tag: "EnergyModel::classify()",
    heading: "Each opcode gets a bucket and a cost",
    narrative: [
      "The pass looks every opcode up in the model: exact aliases first, then LLVM predicates like isBranch() and mayLoad(). Each hit returns a bucket and its relative cost — integer ALU work is the 1.0 baseline, memory traffic costs double.",
      "Summing the loop body gives its raw energy: 9.8 units for one iteration's worth of instructions.",
    ],
    render: () => (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="w-full text-left font-mono text-[11.5px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">opcode</th>
              <th className="px-3 py-2 font-medium max-md:hidden">meaning</th>
              <th className="px-3 py-2 font-medium">bucket · cost</th>
              <th className="px-3 py-2 font-medium max-md:hidden">matched by</th>
            </tr>
          </thead>
          <tbody>
            {LOOP_BODY_INSTRUCTIONS.map((instruction, index) => (
              <tr key={index} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 font-semibold text-foreground">{instruction.opcode}</td>
                <td className="px-3 py-1.5 text-muted-foreground max-md:hidden">{instruction.meaning}</td>
                <td className="px-3 py-1.5">
                  <BucketChip bucket={instruction.bucket} cost={instruction.cost} />
                </td>
                <td className="px-3 py-1.5 text-muted-foreground max-md:hidden">
                  {instruction.matchedBy === "alias" ? "alias table" : "isBranch()"}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30">
              <td className="px-3 py-2 font-semibold text-foreground" colSpan={2}>
                raw energy (for.body)
              </td>
              <td className="px-3 py-2 font-semibold text-foreground" colSpan={2}>
                = 9.8 units
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "weight",
    icon: Scale,
    label: "Weight",
    tag: "frequencyWeight × cost",
    heading: "The loop makes it 10× more important",
    narrative: [
      "Static MIR contains one copy of the loop body — costing it once would rank it barely above straight-line code. So each block is weighted by its expected executions per call. At -O0 (optnone, no branch probabilities) the pass uses the loop-depth fallback: 10 to the power of the nesting depth.",
      "for.body's 9.8 raw units become 98 weighted units. The entry and exit blocks stay at weight 1 — and the hotspot separates itself from the noise.",
    ],
    render: () => (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="w-full text-left font-mono text-[11.5px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-3 py-2 font-medium">block</th>
              <th className="px-3 py-2 font-medium max-md:hidden">depth</th>
              <th className="px-3 py-2 font-medium">weight</th>
              <th className="px-3 py-2 font-medium">raw</th>
              <th className="px-3 py-2 font-medium">weighted</th>
            </tr>
          </thead>
          <tbody>
            {BLOCK_ROWS.map((row) => (
              <tr key={row.name} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5">
                  <span className="font-semibold text-foreground">{row.name}</span>
                  <span className="ml-2 text-muted-foreground">{row.role}</span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground max-md:hidden">{row.depth}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[10px] font-semibold",
                      row.weight > 1 ? "text-background" : "border border-border text-muted-foreground",
                    )}
                    style={row.weight > 1 ? { background: heatColor(row.heat) } : undefined}
                  >
                    {row.weight}×
                  </span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{row.raw.toFixed(1)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted md:w-24">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(row.weighted / 98) * 100}%`,
                          background: heatColor(row.heat),
                        }}
                      />
                    </div>
                    <span className="font-semibold text-foreground">{row.weighted.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30">
              <td className="px-3 py-2 font-semibold text-foreground" colSpan={3}>
                main() total
              </td>
              <td className="px-3 py-2 font-semibold text-muted-foreground">28.4</td>
              <td className="px-3 py-2 font-semibold text-foreground">203.0</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "result",
    icon: Flame,
    label: "Result",
    tag: "[energy] → heatmap",
    heading: "Line 4 lights up — statically",
    narrative: [
      "The pass emits its findings as [energy] JSON records, grouped per source line and painted back over the code. The accumulation on line 4 is the hottest line, with the loop header (compare + increment) right behind it.",
      "Exactly what intuition predicted — but now it is a number you can compare across functions, flags, and revisions.",
    ],
    render: () => (
      <div className="grid gap-3 lg:grid-cols-2">
        <CodeCard label="[energy] record for line 4">
          <div className="text-muted-foreground">
            <div>{"[energy] {"}</div>
            <div>{'  "kind": "line",'}</div>
            <div>{'  "function": "main",'}</div>
            <div>
              {'  "line": '}
              <span className="font-semibold text-primary">4</span>,
            </div>
            <div>{'  "rawEnergy": 9.8,'}</div>
            <div>
              {'  "weightedEnergy": '}
              <span className="font-semibold" style={{ color: "var(--heat-4)" }}>
                98.0
              </span>
              ,
            </div>
            <div>{'  "topOpcodes": ["MOV32rm",'}</div>
            <div>{'    "IMUL32rri", "MOV32mr"]'}</div>
            <div>{"}"}</div>
          </div>
        </CodeCard>
        <CodeCard label="source heatmap · weighted energy / line">
          {HEATMAP_LINES.map((entry) => (
            <div
              key={entry.line}
              className="-mx-1 flex items-center gap-3 rounded px-1"
              style={
                entry.heat > 0
                  ? {
                      background: `color-mix(in oklch, ${heatColor(entry.heat)} ${entry.heat * 9}%, transparent)`,
                    }
                  : undefined
              }
            >
              <span className="w-4 select-none text-right text-muted-foreground/60">{entry.line}</span>
              <span className="flex-1 whitespace-pre text-foreground">{entry.text}</span>
              {entry.weighted !== null && (
                <span
                  className="shrink-0 text-[10px] font-semibold"
                  style={{ color: heatColor(Math.max(entry.heat, 2) as HeatLevel) }}
                >
                  {entry.weighted.toFixed(1)} e
                </span>
              )}
            </div>
          ))}
        </CodeCard>
      </div>
    ),
  },
];

/* ------------------------------ component ------------------------------ */

export function Walkthrough() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Step rail */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const isActive = index === stepIndex;
          const isDone = index < stepIndex;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStepIndex(index)}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-primary/50 bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-semibold transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {item.label}
                </span>
                <span className="hidden truncate font-mono text-[10px] text-muted-foreground/70 lg:block">
                  {item.tag}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-w-0 rounded-2xl border border-border/60 bg-card/70 p-5 md:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                step {stepIndex + 1} / {STEPS.length} · {step.tag}
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                {step.heading}
              </h3>
            </div>

            {step.narrative.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}

            <div className="pt-1">{step.render()}</div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
              >
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <div className="flex items-center gap-1">
                {STEPS.map((item, index) => (
                  <span
                    key={item.id}
                    className={cn(
                      "h-1 rounded-full transition-all",
                      index === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-border",
                    )}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={stepIndex === STEPS.length - 1}
                onClick={() => setStepIndex((value) => Math.min(STEPS.length - 1, value + 1))}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
