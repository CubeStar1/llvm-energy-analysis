import { ScrollArea } from "@/components/ui/scroll-area";
import type { FunctionSummary } from "@/lib/types";

type FunctionsPanelProps = {
  functions: FunctionSummary[];
};

export function FunctionsPanel({ functions }: FunctionsPanelProps) {
  const maxEnergy = Math.max(...functions.map((entry) => entry.weightedEnergy), 0);

  return (
    <ScrollArea className="h-full flex-1 rounded-[1.4rem] border border-border/70 bg-background/85">
      <div className="space-y-4 p-4">
        {functions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Run analysis to rank functions.</p>
        ) : (
          functions.map((entry) => {
            const width = maxEnergy > 0 ? `${(entry.weightedEnergy / maxEnergy) * 100}%` : "0%";

            return (
              <div key={entry.name} className="rounded-2xl border border-border/70 bg-card/75 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 flex-1 mr-4">
                    <p className="font-mono text-sm text-muted-foreground">Function</p>
                    <p 
                      className="font-heading text-2xl tracking-[-0.03em] max-w-[10rem] sm:max-w-[12rem] truncate hover:whitespace-normal hover:break-all transition-all duration-200 cursor-default"
                      title={entry.name}
                    >
                      {entry.name}
                    </p>
                  </div>
                  <p className="font-mono text-sm text-foreground shrink-0">
                    {entry.weightedEnergy.toFixed(2)} weighted
                  </p>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--chart-4),var(--chart-2),var(--chart-1))]"
                    style={{ width }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
                  <span>raw {entry.rawEnergy.toFixed(2)}</span>
                  <span>blocks {entry.blockCount}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
