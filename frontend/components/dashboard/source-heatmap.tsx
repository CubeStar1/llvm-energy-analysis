import { ScrollArea } from "@/components/ui/scroll-area";
import type { AnalyzeResponse } from "@/lib/types";

type SourceHeatmapProps = {
  sourceCode: string;
  analysis: AnalyzeResponse | null;
};

export function SourceHeatmap({ sourceCode, analysis }: SourceHeatmapProps) {
  const energyByLine = new Map(
    (analysis?.sourceAnnotations ?? []).map((annotation) => [annotation.line, annotation]),
  );
  const lines = sourceCode.split("\n");

  return (
    <ScrollArea className="h-[36rem] rounded-[1.4rem] border border-border/70 bg-background/80">
      <div className="grid min-w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-4 py-4 font-mono text-sm">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const annotation = energyByLine.get(lineNumber);
          const energy = annotation?.weightedEnergy ?? 0;
          const intensityClass =
            energy >= 5
              ? "bg-[var(--heat-4)]/25"
              : energy >= 3.5
                ? "bg-[var(--heat-3)]/22"
                : energy >= 2
                  ? "bg-[var(--heat-2)]/18"
                  : energy > 0
                    ? "bg-[var(--heat-1)]/14"
                    : "bg-transparent";

          return (
            <div
              key={lineNumber}
              className={`contents ${annotation ? "text-foreground" : "text-muted-foreground"}`}
            >
              <div className="select-none py-1 text-right text-xs">{lineNumber}</div>
              <div className={`rounded-lg px-3 py-1.5 ${intensityClass}`}>
                {line.length > 0 ? line : " "}
              </div>
              <div className="py-1 text-right text-xs">
                {annotation ? `${annotation.weightedEnergy.toFixed(2)} e` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
