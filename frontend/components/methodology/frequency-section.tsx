"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { heatColor } from "@/lib/graph/heat";

/* ------------------------------------------------------------------ */
/* Frequency weighting, explained as a numbered story. Each step is a  */
/* text column plus a purpose-built visual.                            */
/* ------------------------------------------------------------------ */

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.85em] text-foreground">{children}</span>;
}

/* ------------------------------ visuals ------------------------------ */

function Bar({
  label,
  value,
  max,
  heat,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  heat: 1 | 2 | 3 | 4;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-foreground">{label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {value}{suffix ?? ""}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${(value / max) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: heatColor(heat) }}
        />
      </div>
    </div>
  );
}

/** Step 1 — raw cost alone ranks a 1000-iteration loop next to straight-line code. */
function RawVsWeightedVisual() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" style={{ color: heatColor(3) }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            raw cost only
          </span>
        </div>
        <div className="mt-3 space-y-3">
          <Bar label="loop body ×1000" value={9.8} max={10} heat={2} />
          <Bar label="entry + exit" value={9.0} max={10} heat={2} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Nearly identical — the loop looks as cheap as code that runs once.
        </p>
      </div>
      <div className="rounded-xl border border-primary/40 bg-card p-4">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            × frequency weight
          </span>
        </div>
        <div className="mt-3 space-y-3">
          <Bar label="loop body ×1000" value={98} max={100} heat={4} />
          <Bar label="entry + exit" value={9} max={100} heat={1} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The loop separates itself by an order of magnitude — as it should.
        </p>
      </div>
    </div>
  );
}

/** Step 2 — what the weight means, at a glance. */
function WeightMeaningVisual() {
  const rows: { label: string; weight: string; heat: 0 | 1 | 3 | 4; note: string }[] = [
    { label: "straight-line block", weight: "1.0×", heat: 1, note: "runs once per call" },
    { label: "loop body", weight: "≈32×", heat: 4, note: "expected iterations" },
    { label: "block behind a cold branch", weight: "0.03×", heat: 0, note: "discounted, not free" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={cn(
            "flex items-center gap-3 px-4 py-3",
            index > 0 && "border-t border-border/40",
          )}
        >
          <span
            className={cn(
              "w-14 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-[11px] font-semibold",
              row.heat >= 3 ? "text-background" : "border border-border text-muted-foreground",
              row.heat === 0 && "border-dashed",
            )}
            style={row.heat >= 3 ? { background: heatColor(row.heat) } : undefined}
          >
            {row.weight}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[12px] text-foreground">{row.label}</p>
            <p className="text-[11px] text-muted-foreground">{row.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Steps 3 & 4 — a small CFG with branch probabilities and derived weights. */
function ProbabilityCfgVisual({ showCold }: { showCold?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-col items-center">
        <CfgBlock name="entry" weight="1.0×" tone="neutral" />
        <CfgArrow label="100%" />

        <div className="relative">
          <CfgBlock name="loop.cond" weight="33.3×" tone="hot" />
          {/* back edge from loop.body */}
          <div
            className="absolute -right-5 top-1/2 h-[4.6rem] w-5 rounded-r-xl border border-l-0 border-dashed"
            style={{ borderColor: heatColor(4) }}
          />
        </div>

        <CfgArrow label="97% taken" hot />
        <CfgBlock name="loop.body" weight="32.3×" tone="hot" />

        {showCold ? (
          <>
            <CfgArrow label="3% taken" cold />
            <CfgBlock name="if.error" weight="0.03×" tone="cold" />
            <CfgArrow />
            <CfgBlock name="exit" weight="1.0×" tone="neutral" />
          </>
        ) : (
          <>
            <CfgArrow label="3% exit" />
            <CfgBlock name="exit" weight="1.0×" tone="neutral" />
          </>
        )}
      </div>

      {!showCold && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-center">
          <p className="font-mono text-[11.5px] text-foreground">
            E[iterations] = 1 / (1 − 0.97) ≈ 33
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            a geometric series: keep looping while the back edge keeps winning
          </p>
        </div>
      )}
    </div>
  );
}

function CfgBlock({
  name,
  weight,
  tone,
}: {
  name: string;
  weight: string;
  tone: "neutral" | "hot" | "cold";
}) {
  return (
    <div
      className={cn(
        "flex w-48 items-center justify-between rounded-lg border bg-card px-3 py-2",
        tone === "cold" && "border-dashed opacity-80",
      )}
      style={{
        borderColor:
          tone === "hot"
            ? `color-mix(in oklch, ${heatColor(4)} 60%, var(--border))`
            : "var(--border)",
        background:
          tone === "hot"
            ? `color-mix(in oklch, ${heatColor(4)} 10%, var(--card))`
            : undefined,
      }}
    >
      <span className="font-mono text-[11px] text-foreground">{name}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-px font-mono text-[10px] font-semibold",
          tone === "hot" ? "text-background" : "border border-border/70 text-muted-foreground",
          tone === "cold" && "border-dashed",
        )}
        style={tone === "hot" ? { background: heatColor(4) } : undefined}
      >
        {weight}
      </span>
    </div>
  );
}

function CfgArrow({ label, hot, cold }: { label?: string; hot?: boolean; cold?: boolean }) {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div
        className={cn("h-3.5 w-px", cold && "border-l border-dashed bg-transparent")}
        style={{
          background: cold ? undefined : hot ? heatColor(4) : "var(--border)",
          borderColor: cold ? "var(--border)" : undefined,
        }}
      />
      {label && (
        <span
          className="my-0.5 font-mono text-[9px]"
          style={{ color: hot ? heatColor(4) : "var(--muted-foreground)" }}
        >
          {label}
        </span>
      )}
      {label && (
        <div
          className={cn("h-3.5 w-px", cold && "border-l border-dashed bg-transparent")}
          style={{
            background: cold ? undefined : hot ? heatColor(4) : "var(--border)",
            borderColor: cold ? "var(--border)" : undefined,
          }}
        />
      )}
    </div>
  );
}

/** Step 5 — what -O0 gets wrong. */
function OptnoneVisual() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          what -O0 believes
        </p>
        <div className="mt-3 flex items-center justify-center gap-3 font-mono text-[12px]">
          <span className="rounded-lg border border-border px-2.5 py-1.5 text-foreground">
            loop.cond
          </span>
          <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
            <span>50% ↻</span>
            <span>50% ↓</span>
          </div>
          <span className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-muted-foreground">
            exit
          </span>
        </div>
        <p className="mt-3 text-center font-mono text-[11.5px]">
          <span style={{ color: heatColor(4) }}>
            E[iterations] = 1 / (1 − 0.5) = 2
          </span>
        </p>
        <p className="mt-1 text-center text-[10.5px] text-muted-foreground">
          “every loop in your program runs twice” — useless for ranking
        </p>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-3.5 font-mono text-[11px] leading-relaxed text-foreground">
{`// EnergyAnalysisPass.cpp
const bool hasBranchProbabilities =
    !MF.getFunction().hasOptNone();`}
      </pre>
    </div>
  );
}

/** Step 6 — the loop-depth fallback table. */
function DepthTableVisual() {
  const rows = [
    { depth: 0, weight: "1×", example: "function body", heat: 1 as const },
    { depth: 1, weight: "10×", example: "single loop", heat: 2 as const },
    { depth: 2, weight: "100×", example: "nested loop", heat: 3 as const },
    { depth: 3, weight: "1000×", example: "triply nested", heat: 4 as const },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 bg-muted/40 px-4 py-2 text-center font-mono text-[12px] text-foreground">
        weight = 10 ^ loopDepth
      </div>
      {rows.map((row) => (
        <div
          key={row.depth}
          className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-0"
        >
          <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
            depth {row.depth}
          </span>
          <span
            className="w-16 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-[11px] font-semibold text-background"
            style={{ background: heatColor(row.heat) }}
          >
            {row.weight}
          </span>
          <span className="text-[11.5px] text-muted-foreground">{row.example}</span>
        </div>
      ))}
      <div className="bg-muted/30 px-4 py-2.5">
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          The Ball–Larus static-profile estimate: an assumption, but a deliberate
          and documented one. Each function record reports{" "}
          <Mono>frequencyModel: &quot;loop-depth&quot;</Mono> so no number pretends
          to be something it is not.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- steps ------------------------------- */

const STEPS: {
  id: string;
  title: string;
  paragraphs: React.ReactNode[];
  visual: React.ReactNode;
}[] = [
  {
    id: "problem",
    title: "The problem: static code has no idea how often it runs",
    paragraphs: [
      <>
        Machine IR contains exactly <em>one</em> copy of a loop body, no matter
        whether it iterates twice or a million times. Summing instruction costs
        alone would rank our 1000-iteration loop body (raw <Mono>9.8</Mono>)
        right next to the entry and exit code that runs once (raw{" "}
        <Mono>≈9.0</Mono>).
      </>,
      <>
        Any static energy estimate that ignores execution frequency is really
        just an instruction counter. So every block&apos;s cost must be scaled
        by how often that block is <em>expected</em> to execute.
      </>,
    ],
    visual: <RawVsWeightedVisual />,
  },
  {
    id: "definition",
    title: "The fix: weight every block by expected executions per call",
    paragraphs: [
      <>
        The pass computes{" "}
        <Mono>weightedEnergy = Σ cost(instr) × frequencyWeight(block)</Mono>.
        The frequency weight answers one precise question: <em>if this function
        is called once, how many times does this block run?</em>
      </>,
      <>
        Straight-line code scores exactly <Mono>1.0</Mono>. Loop bodies score
        far above 1. And — just as important — a block hiding behind an
        unlikely branch scores <em>below</em> 1, so cold error paths stop
        inflating the total.
      </>,
    ],
    visual: <WeightMeaningVisual />,
  },
  {
    id: "mbfi",
    title: "Where weights come from: branch probabilities, propagated",
    paragraphs: [
      <>
        At <Mono>-O1</Mono> and above, LLVM annotates every conditional branch
        with a probability (a loop back edge defaults to ~97% taken).{" "}
        <Mono>MachineBlockFrequencyInfo</Mono> propagates those probabilities
        through the CFG and hands each block an absolute frequency.
      </>,
      <>
        The pass normalizes against the entry block —{" "}
        <Mono>weight = blockFreq(bb) / entryFreq</Mono> — turning LLVM&apos;s
        internal fixed-point numbers into the &quot;executions per call&quot;
        ratio. For the loop: a 97% back edge means the expected iteration count
        is a geometric series, <Mono>1 / (1 − 0.97) ≈ 33</Mono>.
      </>,
    ],
    visual: <ProbabilityCfgVisual />,
  },
  {
    id: "cold",
    title: "The same math discounts cold paths",
    paragraphs: [
      <>
        This is what a loop-depth heuristic can never do. An error branch taken
        3% of the time gets weight <Mono>0.03</Mono> — its instructions still
        count, but at 3% of face value.
      </>,
      <>
        Without this, defensive code (bounds checks, throw paths, logging)
        would be costed as if it always executes, and a function full of error
        handling would look hotter than the loop next to it.
      </>,
    ],
    visual: <ProbabilityCfgVisual showCold />,
  },
  {
    id: "optnone",
    title: "The -O0 trap: no probabilities exist",
    paragraphs: [
      <>
        At <Mono>-O0</Mono>, clang marks every function <Mono>optnone</Mono>{" "}
        and SelectionDAG skips branch-probability analysis entirely. Every
        branch sits at a flat 50/50 — and under 50/50, the geometric series
        says every loop iterates exactly <em>twice</em>. Loop bodies would rank
        barely above straight-line code.
      </>,
      <>
        The pass detects this with a single check —{" "}
        <Mono>Function::hasOptNone()</Mono> — and refuses to use the
        meaningless numbers.
      </>,
    ],
    visual: <OptnoneVisual />,
  },
  {
    id: "fallback",
    title: "The fallback: 10 per level of loop nesting",
    paragraphs: [
      <>
        For <Mono>optnone</Mono> functions the pass switches to the classic
        static estimate: <Mono>weight = 10^loopDepth</Mono>, using{" "}
        <Mono>MachineLoopInfo</Mono> for the depth. Cruder — it cannot discount
        cold paths — but it restores the property that matters most: loops
        dominate, and nesting compounds.
      </>,
      <>
        Both models remain static estimates. Neither knows real trip counts or
        input data — which is exactly why every function record carries its{" "}
        <Mono>frequencyModel</Mono>, and why results are for <em>ranking</em>{" "}
        hotspots, not measuring joules.
      </>,
    ],
    visual: <DepthTableVisual />,
  },
];

/* ----------------------------- component ----------------------------- */

export function FrequencySection() {
  return (
    <div className="space-y-6">
      {/* The core formula, up front. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center md:p-6"
      >
        <p className="font-mono text-sm text-foreground md:text-base">
          weightedEnergy&nbsp;=&nbsp;<span className="text-primary">Σ</span>
          &nbsp;cost(instruction)&nbsp;×&nbsp;
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
            frequencyWeight(block)
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground md:text-sm">
          Six steps below: why the weight exists, where it comes from, and what
          happens when the compiler refuses to provide one.
        </p>
      </motion.div>

      {/* Numbered story */}
      <div className="relative space-y-6 lg:space-y-8">
        {/* timeline spine */}
        <div className="absolute bottom-6 left-[15px] top-2 hidden w-px bg-border/70 md:block" />

        {STEPS.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative md:pl-12"
          >
            <div className="absolute left-0 top-1 hidden size-8 items-center justify-center rounded-full border border-primary/40 bg-background font-mono text-[12px] font-semibold text-primary md:flex">
              {index + 1}
            </div>

            <div className="grid gap-5 rounded-2xl border border-border/60 bg-card/60 p-5 md:p-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
              <div className="space-y-3">
                <h3 className="text-base font-semibold tracking-tight text-foreground md:text-lg">
                  <span className="mr-2 font-mono text-sm text-primary md:hidden">
                    {index + 1}.
                  </span>
                  {step.title}
                </h3>
                {step.paragraphs.map((paragraph, paragraphIndex) => (
                  <p
                    key={paragraphIndex}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
              <div>{step.visual}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
