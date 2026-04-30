"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Cpu, FlaskConical, Zap } from "lucide-react";

import { analyzeCode } from "@/lib/api";
import { DEFAULT_SOURCE_CODE } from "@/lib/sample-program";
import type { AnalyzeResponse } from "@/lib/types";
import { AnalysisTabs } from "@/components/dashboard/analysis-tabs";
import { AppHeader } from "@/components/dashboard/app-header";
import { EditorPanel } from "@/components/dashboard/editor-panel";
import { MetricsStrip } from "@/components/dashboard/metrics-strip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

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

  return (
    <main className="flex min-h-screen flex-col px-4 py-5 md:px-6 md:py-6">
      <div className="flex w-full flex-col gap-4 flex-1">
        <AppHeader/>

        <MetricsStrip analysis={analysis} lastRunAt={lastRunAt} />

        <ResizablePanelGroup orientation="horizontal" className="flex-1 rounded-xl border">
          <ResizablePanel defaultSize={45} minSize={30} className="p-4">
            <EditorPanel
              code={code}
              compilerFlags={compilerFlags}
              error={error}
              isBusy={isRunning || isPending}
              std={std}
              onCodeChange={setCode}
              onCompilerFlagsChange={setCompilerFlags}
              onRunAnalysis={handleRunAnalysis}
              onStdChange={setStd}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={55} minSize={30} className="p-4">
            <AnalysisTabs analysis={analysis} sourceCode={deferredCode} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
