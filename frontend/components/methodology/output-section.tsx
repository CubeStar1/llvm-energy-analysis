"use client";

import { motion } from "framer-motion";
import { FileText } from "lucide-react";

/** The three [energy] record kinds and the UI surfaces each one powers. */
const RECORDS: {
  kind: string;
  fields: string;
  description: string;
  powers: string[];
  sample: string[];
}[] = [
  {
    kind: "function",
    fields: "totals · counts · frequencyModel",
    description:
      "One per machine function: raw and weighted totals, block and instruction counts, how many opcodes were mapped vs. fell back, and which frequency model was used.",
    powers: ["Function ranking", "Summary cards"],
    sample: [
      `{"kind":"function",`,
      ` "function":"main",`,
      ` "rawEnergy":28.4,`,
      ` "weightedEnergy":203.0,`,
      ` "blockCount":5,`,
      ` "frequencyModel":"loop-depth"}`,
    ],
  },
  {
    kind: "block",
    fields: "weights · successors · instructions",
    description:
      "One per machine basic block. number + successors encode the control-flow graph; each record carries its frequency weight, loop depth, source range, and up to 40 classified instructions.",
    powers: ["CFG view", "Block inspector"],
    sample: [
      `{"kind":"block",`,
      ` "number":2, "successors":[3],`,
      ` "frequencyWeight":10.0,`,
      ` "loopDepth":1,`,
      ` "weightedEnergy":98.0,`,
      ` "instructions":[…]}`,
    ],
  },
  {
    kind: "line",
    fields: "file · line · topOpcodes",
    description:
      "One per (function, file, line, column) with attributed instructions — the DILocation trail leading back to source. Sorted so the hottest line is always first.",
    powers: ["Source heatmap", "AST energy roll-up", "Remarks"],
    sample: [
      `{"kind":"line",`,
      ` "file":"main.cpp","line":4,`,
      ` "rawEnergy":9.8,`,
      ` "weightedEnergy":98.0,`,
      ` "topOpcodes":["MOV32rm",`,
      `   "IMUL32rri","MOV32mr"]}`,
    ],
  },
];

export function OutputSection() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {RECORDS.map((record, index) => (
          <motion.div
            key={record.kind}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: index * 0.1 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70"
          >
            <div className="border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  &quot;kind&quot;: &quot;{record.kind}&quot;
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{record.fields}</p>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {record.description}
              </p>
              <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-3 font-mono text-[10.5px] leading-relaxed text-foreground">
                {record.sample.join("\n")}
              </pre>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  powers
                </span>
                {record.powers.map((surface) => (
                  <span
                    key={surface}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2 py-px text-[10px] text-primary"
                  >
                    {surface}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, delay: 0.2 }}
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 md:flex-row md:items-center md:gap-4 md:px-5"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <FileText className="size-4" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Second channel: LLVM optimization remarks
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground md:flex-1">
          The pass also emits <span className="font-mono text-xs">FunctionEnergy</span> and{" "}
          <span className="font-mono text-xs">HotBlock</span> analysis remarks through LLVM&apos;s
          native remark machinery (<span className="font-mono text-xs">-pass-remarks-analysis=energy</span>),
          written to YAML. JSON stays the stable app contract; remarks keep the analysis
          interoperable with standard LLVM tooling.
        </p>
      </motion.div>
    </div>
  );
}
