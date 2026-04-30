import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyzeResponse } from "@/lib/types";
import { FunctionsPanel } from "@/components/dashboard/functions-panel";
import { LlvmIrPanel } from "@/components/dashboard/llvm-ir-panel";
import { RemarksTable } from "@/components/dashboard/remarks-table";
import { SourceHeatmap } from "@/components/dashboard/source-heatmap";

type AnalysisTabsProps = {
  analysis: AnalyzeResponse | null;
  sourceCode: string;
};

export function AnalysisTabs({ analysis, sourceCode }: AnalysisTabsProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Output instrumentation
        </p>
        <h2 className="font-heading text-2xl tracking-[-0.03em] font-semibold">
          Analysis surfaces
        </h2>
      </div>
      <div className="flex-1">
        <Tabs defaultValue="source" className="flex flex-col h-full min-h-[36rem]">
          <TabsList variant="line" className="mb-3 w-full justify-start overflow-x-auto rounded-none px-0">
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="llvm-ir">LLVM IR</TabsTrigger>
            <TabsTrigger value="remarks">Remarks</TabsTrigger>
            <TabsTrigger value="functions">Functions</TabsTrigger>
          </TabsList>

          <TabsContent value="source" className="min-h-0 flex-1">
            <SourceHeatmap sourceCode={sourceCode} analysis={analysis} />
          </TabsContent>
          <TabsContent value="llvm-ir" className="min-h-0 flex-1">
            <LlvmIrPanel llvmIr={analysis?.llvmIr ?? ""} />
          </TabsContent>
          <TabsContent value="remarks" className="min-h-0 flex-1">
            <RemarksTable remarks={analysis?.remarks ?? []} />
          </TabsContent>
          <TabsContent value="functions" className="min-h-0 flex-1">
            <FunctionsPanel functions={analysis?.functions ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
