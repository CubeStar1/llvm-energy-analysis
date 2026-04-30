import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyzeResponse } from "@/lib/types";
import { FunctionsPanel } from "@/components/dashboard/functions-panel";
import { LlvmIrPanel } from "@/components/dashboard/llvm-ir-panel";
import { RemarksTable } from "@/components/dashboard/remarks-table";
import { SourceHeatmap } from "@/components/dashboard/source-heatmap";
import { MetricsStrip } from "@/components/dashboard/metrics-strip";

type AnalysisTabsProps = {
  analysis: AnalyzeResponse | null;
  sourceCode: string;
  lastRunAt: string | null;
};

export function AnalysisTabs({ analysis, sourceCode, lastRunAt }: AnalysisTabsProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="border-b px-4 py-3 shrink-0 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground">
          Analysis surfaces
        </h2>
      </div>
      <div className="flex-1 px-4 min-h-0">
        <Tabs defaultValue="stats" className="flex flex-col h-full min-h-0">
          <TabsList className="mb-3 w-full justify-start overflow-x-auto">
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="llvm-ir">LLVM IR</TabsTrigger>
            <TabsTrigger value="remarks">Remarks</TabsTrigger>
            <TabsTrigger value="functions">Functions</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col overflow-y-auto overflow-x-hidden px-1 pt-1 pb-4">
            <MetricsStrip analysis={analysis} lastRunAt={lastRunAt} />
          </TabsContent>
          <TabsContent value="source" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col pb-4">
            <SourceHeatmap sourceCode={sourceCode} analysis={analysis} />
          </TabsContent>
          <TabsContent value="llvm-ir" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col pb-4">
            <LlvmIrPanel llvmIr={analysis?.llvmIr ?? ""} />
          </TabsContent>
          <TabsContent value="remarks" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col pb-4">
            <RemarksTable remarks={analysis?.remarks ?? []} />
          </TabsContent>
          <TabsContent value="functions" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col pb-4">
            <FunctionsPanel functions={analysis?.functions ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
