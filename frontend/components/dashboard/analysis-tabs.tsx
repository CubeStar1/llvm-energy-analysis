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
      <div className="border-b px-4 py-3 shrink-0 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground">
          Analysis surfaces
        </h2>
      </div>
      <div className="flex-1 px-4 min-h-0">
        <Tabs defaultValue="source" className="flex flex-col h-full min-h-0">
          <TabsList variant="line" className="mb-3 w-full justify-start overflow-x-auto rounded-none px-0">
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="llvm-ir">LLVM IR</TabsTrigger>
            <TabsTrigger value="remarks">Remarks</TabsTrigger>
            <TabsTrigger value="functions">Functions</TabsTrigger>
          </TabsList>

          <TabsContent value="source" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col">
            <SourceHeatmap sourceCode={sourceCode} analysis={analysis} />
          </TabsContent>
          <TabsContent value="llvm-ir" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col">
            <LlvmIrPanel llvmIr={analysis?.llvmIr ?? ""} />
          </TabsContent>
          <TabsContent value="remarks" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col">
            <RemarksTable remarks={analysis?.remarks ?? []} />
          </TabsContent>
          <TabsContent value="functions" className="min-h-0 flex-1 h-full data-[state=active]:flex flex-col">
            <FunctionsPanel functions={analysis?.functions ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
