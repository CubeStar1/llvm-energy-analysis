"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { heatColor, type HeatLevel } from "@/lib/graph/heat";

/** The seven cost buckets from llvm-pass/models/x86_64-energy-model.json (v4).
 *  integer_alu is the 1.0 baseline; everything else is a ratio against it. */
const BUCKETS: {
  name: string;
  cost: number;
  heat: HeatLevel;
  examples: string[];
  intent: string;
}[] = [
  { name: "integer_alu", cost: 1.0, heat: 1, examples: ["ADD64rr", "IMUL32rri", "XOR32rr"], intent: "Scalar arithmetic, logic, shifts, register moves — the baseline." },
  { name: "compare", cost: 1.2, heat: 1, examples: ["CMP32mi", "TEST64rr"], intent: "Flag-setting compares and tests." },
  { name: "branch", cost: 1.6, heat: 2, examples: ["JCC_1", "JMP_1", "RET64"], intent: "Conditional and unconditional jumps, returns." },
  { name: "load", cost: 2.0, heat: 3, examples: ["MOV64rm", "MOV32rm"], intent: "Anything that may read memory." },
  { name: "store", cost: 2.2, heat: 3, examples: ["MOV64mr", "MOV32mi"], intent: "Anything that may write memory." },
  { name: "fp_or_vector_fallback", cost: 2.8, heat: 4, examples: ["MULSD", "ADDPS", "*XMM*"], intent: "Floating-point and SIMD/vector work." },
  { name: "call", cost: 3.0, heat: 4, examples: ["CALL64pcrel32"], intent: "Direct and indirect calls — the priciest single event." },
];

const MAX_COST = 3.0;

/** EnergyModel::classify() — first match wins, top to bottom. */
const CASCADE: { check: string; result: string; note?: string }[] = [
  { check: "Exact opcode alias in the model", result: "aliased bucket", note: "~200 x86-64 opcodes mapped explicitly" },
  { check: "MachineInstr::isCall()", result: "call" },
  { check: "MachineInstr::isBranch()", result: "branch" },
  { check: "MachineInstr::mayLoad()", result: "load" },
  { check: "MachineInstr::mayStore()", result: "store" },
  { check: "Opcode name has CMP / TEST", result: "compare" },
  { check: "Opcode name has XMM · YMM · ZMM · F…", result: "fp_or_vector_fallback" },
  { check: "Nothing matched", result: "integer_alu", note: "default fallback, flagged in the output" },
];

export function EnergyModelSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Bucket costs as a meter list — length encodes the relative cost,
          the heat ramp is a redundant cue, values stay in text ink. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-border/60 bg-card/70 p-5 md:p-6"
      >
        <h3 className="text-base font-semibold text-foreground">
          Seven buckets, relative costs
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Costs live in a versioned JSON file, not in C++ — calibrated against
          Agner Fog&apos;s instruction tables and Intel&apos;s optimization manual to
          preserve <em>ordering</em>, not to measure joules.
        </p>

        <div className="mt-5 space-y-4">
          {BUCKETS.map((bucket, index) => (
            <motion.div
              key={bucket.name}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
              title={bucket.intent}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {bucket.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {bucket.cost.toFixed(1)}×
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(bucket.cost / MAX_COST) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.15 + index * 0.05, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: heatColor(bucket.heat) }}
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {bucket.examples.map((opcode) => (
                  <span
                    key={opcode}
                    className="rounded border border-border/60 bg-muted/40 px-1.5 py-px font-mono text-[10px] text-muted-foreground"
                  >
                    {opcode}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Classification cascade */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl border border-border/60 bg-card/70 p-5 md:p-6"
      >
        <h3 className="text-base font-semibold text-foreground">
          The classification cascade
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono text-xs">EnergyModel::classify()</span> runs
          these checks top to bottom — first match wins. Aliases give precision
          where it matters; LLVM&apos;s own instruction predicates catch everything
          else, so the pass never needs to know every opcode.
        </p>

        <div className="mt-5 space-y-0">
          {CASCADE.map((step, index) => (
            <motion.div
              key={step.check}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.06 }}
            >
              <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/60 px-3.5 py-2.5 transition-colors hover:border-primary/40">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11.5px] text-foreground">{step.check}</p>
                  {step.note && (
                    <p className="truncate text-[10.5px] text-muted-foreground">{step.note}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
                  → {step.result}
                </span>
              </div>
              {index < CASCADE.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="size-3 text-muted-foreground/40" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
