"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { analyzeCode } from "@/lib/api";
import { DEFAULT_SOURCE_CODE } from "@/lib/sample-program";
import type { AnalyzeResponse } from "@/lib/types";
import { AnalysisTabs } from "@/components/dashboard/analysis-tabs";
import { EditorPanel } from "@/components/dashboard/editor-panel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DashboardToolbar } from "@/components/dashboard/dashboard-toolbar";

const DEFAULT_FLAGS = "-O2";

export function AnalyzerDashboard() {
  const [code, setCode] = useState(DEFAULT_SOURCE_CODE);
  const [std, setStd] = useState("c++20");
  const [compilerFlags, setCompilerFlags] = useState(DEFAULT_FLAGS);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deferredCode = useDeferredValue(code);
  const parsedFlags = useMemo(
    () => compilerFlags.split(/\s+/).map((value) => value.trim()).filter(Boolean),
    [compilerFlags],
  );

  async function handleRunAnalysis() {
    setIsRunning(true);
    setError(null);

    try {
      const nextAnalysis = await analyzeCode({
        code,
        filename: "main.cpp",
        std,
        compilerFlags: parsedFlags.length > 0 ? parsedFlags : ["-O2"],
      });

      startTransition(() => {
        setAnalysis(nextAnalysis);
        setLastRunAt(new Date().toLocaleTimeString());
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Analysis failed.");
    } finally {
      setIsRunning(false);
    }
  }

  const isBusy = isRunning || isPending;

  return (
    <div className="flex w-full h-full flex-col gap-4 flex-1 overflow-hidden">
      <DashboardToolbar
        std={std}
        compilerFlags={compilerFlags}
        isBusy={isBusy}
        onStdChange={setStd}
        onCompilerFlagsChange={setCompilerFlags}
        onRunAnalysis={handleRunAnalysis}
      />



      <ResizablePanelGroup orientation="horizontal" className="flex-1 rounded-xl border shadow-sm min-h-0 overflow-hidden">
        <ResizablePanel defaultSize={45} minSize={30} className="p-0 bg-card">
          <EditorPanel
            code={code}
            error={error}
            onCodeChange={setCode}
          />
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={55} minSize={30} className="p-0 bg-card border-l">
          <AnalysisTabs analysis={analysis} sourceCode={deferredCode} lastRunAt={lastRunAt} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
