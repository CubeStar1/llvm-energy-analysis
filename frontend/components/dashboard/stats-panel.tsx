"use client";

import { useEffect, useState } from "react";
import { Flame, Gauge, ListTree, MapPinned } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchEnergyModel } from "@/lib/api";
import { bucketCopy } from "@/lib/energy/buckets";
import type { AnalyzeResponse, EnergyModel, FrequencyModel } from "@/lib/types";

type StatsPanelProps = {
  analysis: AnalyzeResponse | null;
  lastRunAt: string | null;
};

const EMPTY_VALUE = "—";

export function StatsPanel({ analysis, lastRunAt }: StatsPanelProps) {
  const [model, setModel] = useState<EnergyModel | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchEnergyModel()
      .then((next) => {
        if (!cancelled) setModel(next);
      })
      .catch(() => {
        // The cost table is explanatory; failing to load it must not break the
        // metrics above it.
        if (!cancelled) setModel(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = analysis?.summary;
  const frequencyModel: FrequencyModel =
    analysis?.functions[0]?.frequencyModel ?? "block-frequency";

  return (
    <ScrollArea className="h-full flex-1">
      <div className="space-y-6 pr-3 pb-2">
        <MetricCards summary={summary} lastRunAt={lastRunAt} />
        <ReadingGuide analysis={analysis} />
        <FrequencyGuide analysis={analysis} frequencyModel={frequencyModel} />
        <CostTable model={model} />
        <Caveats />
      </div>
    </ScrollArea>
  );
}

function MetricCards({
  summary,
  lastRunAt,
}: {
  summary: AnalyzeResponse["summary"] | undefined;
  lastRunAt: string | null;
}) {
  const metrics = [
    {
      icon: Flame,
      label: "Total weighted energy",
      value: summary ? summary.totalWeightedEnergy.toFixed(2) : EMPTY_VALUE,
      hint: "What the program is estimated to cost, counting hot code more than once.",
    },
    {
      icon: Gauge,
      label: "Total raw energy",
      value: summary ? summary.totalRawEnergy.toFixed(2) : EMPTY_VALUE,
      hint: "Cost of the instructions as written, each counted exactly once.",
    },
    {
      icon: MapPinned,
      label: "Hottest function",
      value: summary?.hottestFunction ?? EMPTY_VALUE,
      hint: "Highest weighted energy. Start optimizing here.",
    },
    {
      icon: ListTree,
      label: "Hottest line",
      value: summary?.hottestLine ? `L${summary.hottestLine}` : EMPTY_VALUE,
      hint: "The single source line carrying the most weighted energy.",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Static analysis · nothing was executed
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {lastRunAt ? `Last run ${lastRunAt}` : "Not yet run"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map(({ icon: Icon, label, value, hint }) => (
          <div
            key={label}
            className="rounded-2xl border border-border/70 bg-card/75 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {label}
              </p>
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            </div>
            <p
              className="mt-2 truncate font-heading text-2xl tracking-[-0.03em] text-foreground"
              title={value}
            >
              {value}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {hint}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.4rem] border border-border/70 bg-card/60 p-5">
      <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function ReadingGuide({ analysis }: { analysis: AnalyzeResponse | null }) {
  const hottest = analysis?.functions[0];

  return (
    <Section title="How to read these numbers">
      <p>
        Nothing here was executed. Your code is compiled down to real machine
        instructions, each instruction is charged a cost from the table below, and
        those costs are added up. The numbers are{" "}
        <strong className="text-foreground">relative units, not joules</strong> —
        one unit is roughly what a single integer instruction like{" "}
        <code className="font-mono text-xs text-foreground">i + 1</code> costs. They
        are for comparing one part of your program against another, not for
        predicting battery life.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <p className="font-mono text-xs font-semibold text-foreground">Raw energy</p>
          <p className="mt-1 text-xs">
            Add up the cost of every instruction, counting each one{" "}
            <strong className="text-foreground">once</strong>. This is the size of
            the code, in energy terms.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <p className="font-mono text-xs font-semibold text-foreground">
            Weighted energy
          </p>
          <p className="mt-1 text-xs">
            The same sum, but each instruction is multiplied by{" "}
            <strong className="text-foreground">how many times it is expected to run</strong>.
            This is the one you care about.
          </p>
        </div>
      </div>

      <p>
        The difference is the whole point. A loop body appears exactly once in the
        compiled code, so raw energy counts it once — even though it may run
        thousands of times. Weighted energy is what stops a one-line loop body from
        being ranked below a long stretch of code that runs once.
      </p>

      {hottest && (
        <p className="rounded-xl border border-border/60 bg-background/60 p-3 font-mono text-xs">
          <span className="text-foreground">{hottest.name}</span> — raw{" "}
          <span className="text-foreground">{hottest.rawEnergy.toFixed(1)}</span>,
          weighted{" "}
          <span className="text-foreground">{hottest.weightedEnergy.toFixed(1)}</span>
          {hottest.weightedEnergy > hottest.rawEnergy
            ? ` — ${(hottest.weightedEnergy / Math.max(hottest.rawEnergy, 0.01)).toFixed(1)}× higher, because much of it sits inside a loop.`
            : hottest.weightedEnergy < hottest.rawEnergy
              ? " — lower than raw, because some of it sits behind a branch that is not always taken."
              : " — identical, because none of it is inside a loop."}
        </p>
      )}
    </Section>
  );
}

function FrequencyGuide({
  analysis,
  frequencyModel,
}: {
  analysis: AnalyzeResponse | null;
  frequencyModel: FrequencyModel;
}) {
  const usesLoopDepth = frequencyModel === "loop-depth";

  return (
    <Section title="Where the weighting comes from">
      <p>
        Every basic block — a straight run of instructions with no jumps in or out —
        gets a{" "}
        <strong className="text-foreground">frequency weight</strong>: how many times
        it is expected to run per call of its function. Straight-line code is{" "}
        <code className="font-mono text-xs text-foreground">1×</code>. A loop body is
        more. A block behind an{" "}
        <code className="font-mono text-xs text-foreground">if</code> is{" "}
        <em>less</em> than 1×, because it does not always run.
      </p>

      <p className="font-mono text-xs text-foreground">
        weighted energy = instruction cost × frequency weight
      </p>

      {analysis && (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: usesLoopDepth ? "var(--heat-3)" : "var(--border)",
          }}
        >
          <p className="font-mono text-xs font-semibold text-foreground">
            This run used: {usesLoopDepth ? "loop-depth estimate" : "LLVM block frequencies"}
          </p>
          <p className="mt-1 text-xs">
            {usesLoopDepth ? (
              <>
                You compiled at{" "}
                <code className="font-mono text-foreground">-O0</code>, where the
                compiler does not work out how likely each branch is — so it cannot
                tell a hot loop from a cold error path. Weights fall back to a fixed
                guess: <strong className="text-foreground">10× per level of loop nesting</strong>{" "}
                (10× in a loop, 100× in a nested loop). Good enough to rank hotspots,
                but crude. Recompile at{" "}
                <code className="font-mono text-foreground">-O2</code> for the real
                model.
              </>
            ) : (
              <>
                The compiler estimated how likely each branch is to be taken and
                propagated that through the control flow graph. A loop&apos;s back
                edge is assumed taken about 97% of the time, which works out to
                roughly 32 iterations, and blocks behind a conditional branch are
                discounted below 1×. These are still estimates — the compiler does
                not know your actual input sizes.
              </>
            )}
          </p>
        </div>
      )}

      <p className="text-xs">
        You can see every block&apos;s weight in the{" "}
        <strong className="text-foreground">CFG</strong> tab — the{" "}
        <code className="font-mono text-foreground">n×</code> badge on each block.
      </p>
    </Section>
  );
}

function CostTable({ model }: { model: EnergyModel | null }) {
  if (!model) {
    return (
      <Section title="What each instruction costs">
        <p className="text-xs">Loading the energy model…</p>
      </Section>
    );
  }

  const maxCost = Math.max(...model.buckets.map((bucket) => bucket.cost), 1);

  return (
    <Section title="What each instruction costs">
      <p>
        Instructions are grouped into buckets, and every instruction in a bucket is
        charged the same cost. Integer math is the baseline at{" "}
        <code className="font-mono text-xs text-foreground">1.0</code>; everything
        else is a multiple of it. Reading memory costs about twice an add; a
        floating-point or vector operation, nearly three times.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/70">
              <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Bucket
              </th>
              <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Cost
              </th>
              <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                In your C++
              </th>
            </tr>
          </thead>
          <tbody>
            {model.buckets.map((bucket) => {
              const copy = bucketCopy(bucket.name);

              return (
                <tr key={bucket.name} className="border-b border-border/40 align-top">
                  <td className="py-3 pr-4">
                    <p className="text-sm font-medium text-foreground">{copy.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {bucket.name}
                    </p>
                    <p className="mt-1.5 max-w-md text-xs leading-relaxed">
                      {copy.blurb}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground">
                        {bucket.cost.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(bucket.cost / maxCost) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3">
                    <code className="font-mono text-xs text-foreground">
                      {copy.cppExample}
                    </code>
                    {bucket.exampleOpcodes.length > 0 && (
                      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                        {bucket.exampleOpcodes.slice(0, 3).join(" · ")}
                        {bucket.opcodeCount > 3 && ` · +${bucket.opcodeCount - 3}`}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs">
        Model <span className="font-mono text-foreground">{model.target}</span> v
        {model.version} · {model.aliasCount} opcodes mapped by name · anything the
        model does not recognize falls back to{" "}
        <span className="font-mono text-foreground">
          {model.defaultFallbackCost.toFixed(1)}
        </span>
        . The costs are relative ratios drawn from published instruction-energy and
        throughput data, not measurements from your machine.
      </p>
    </Section>
  );
}

function Caveats() {
  return (
    <Section title="What this cannot tell you">
      <ul className="list-disc space-y-1.5 pl-4 text-xs">
        <li>
          <strong className="text-foreground">Nothing ran.</strong> This is static
          analysis. It does not know your input sizes, so a loop over 10 elements and
          one over 10 million look the same.
        </li>
        <li>
          <strong className="text-foreground">Units are relative.</strong> A total of
          &quot;250&quot; is meaningless on its own; it is only useful next to another
          number from the same tool.
        </li>
        <li>
          <strong className="text-foreground">Memory effects are invisible.</strong> A
          cache miss costs far more than a cache hit in reality, but both are charged
          the same &quot;memory read&quot; cost here.
        </li>
        <li>
          <strong className="text-foreground">The optimizer changes everything.</strong>{" "}
          At <code className="font-mono text-foreground">-O2</code> your loop may be
          vectorized, unrolled, or deleted outright. The analysis measures what the
          compiler actually produced, which may look nothing like what you wrote.
        </li>
      </ul>
    </Section>
  );
}
