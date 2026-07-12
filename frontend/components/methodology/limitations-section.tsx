"use client";

import { motion } from "framer-motion";
import {
  CircleSlash,
  Database,
  GitMerge,
  Layers,
  ShieldAlert,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LIMITATIONS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CircleSlash,
    title: "Relative units, not joules",
    body: "Values are dimensionless ratios for comparing hotspots. Measuring watts, cycles, or thermals is explicitly a non-goal — that is what RAPL and hardware profilers are for.",
  },
  {
    icon: Timer,
    title: "Static trip counts",
    body: "LLVM's block-frequency model assumes a fixed back-edge probability (~32 iterations); the -O0 fallback assumes 10 per nesting level. A loop that really runs a million times still looks like 32.",
  },
  {
    icon: ShieldAlert,
    title: "Debug info degrades under -O2",
    body: "Aggressive optimization can merge, move, or drop source locations, so line attribution is best-effort after heavy transformation.",
  },
  {
    icon: GitMerge,
    title: "Inlining moves energy",
    body: "An inlined callee disappears as a function and its cost lands in the caller — correct at machine level, but it can surprise you in the ranking.",
  },
  {
    icon: Database,
    title: "Memory is costed coarsely",
    body: "A load costs 2.0 whether it hits L1 or misses to DRAM. Cache behavior, vector width, and bandwidth are not modeled in a calibrated way.",
  },
  {
    icon: Layers,
    title: "Per-function accounting",
    body: "Weights are per call of each function. There is no inter-procedural propagation — main's total does not include its callees' bodies.",
  },
];

export function LimitationsSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {LIMITATIONS.map((limitation, index) => {
        const Icon = limitation.icon;
        return (
          <motion.div
            key={limitation.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
            className="rounded-2xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-border md:p-5"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <Icon className="size-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{limitation.title}</h3>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
              {limitation.body}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
