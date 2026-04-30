import { Flame, Gauge, ListTree, MapPinned } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyzeResponse } from "@/lib/types";

type MetricsStripProps = {
  analysis: AnalyzeResponse | null;
  lastRunAt: string | null;
};

const EMPTY_VALUE = "—";

export function MetricsStrip({ analysis, lastRunAt }: MetricsStripProps) {
  const summary = analysis?.summary;

  const metrics = [
    {
      icon: Flame,
      label: "Total weighted energy",
      value: summary ? summary.totalWeightedEnergy.toFixed(2) : EMPTY_VALUE,
    },
    {
      icon: Gauge,
      label: "Hottest function",
      value: summary?.hottestFunction ?? EMPTY_VALUE,
    },
    {
      icon: MapPinned,
      label: "Hottest line",
      value: summary?.hottestLine ? `L${summary.hottestLine}` : EMPTY_VALUE,
    },
    {
      icon: ListTree,
      label: "Last run",
      value: lastRunAt ?? "Not yet run",
    },
  ];

  return (
    <section className="flex-1 grid gap-3 grid-cols-2 grid-rows-2 min-h-0">
      {metrics.map(({ icon: Icon, label, value }) => (
        <Card key={label} className="shadow-sm">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="size-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl tracking-[-0.04em] text-foreground">{value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
