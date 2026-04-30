"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Cpu, FlaskConical, Zap } from "lucide-react";

import { analyzeCode, API_BASE_URL } from "@/lib/api";
import { DEFAULT_SOURCE_CODE } from "@/lib/sample-program";
import type { AnalyzeResponse } from "@/lib/types";
import { AnalysisTabs } from "@/components/dashboard/analysis-tabs";
import { AppHeader } from "@/components/dashboard/app-header";
import { EditorPanel } from "@/components/dashboard/editor-panel";
import { MetricsStrip } from "@/components/dashboard/metrics-strip";

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
    <main className="min-h-screen px-4 py-5 md:px-6 md:py-6">
      <div className="lab-grid mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-4 overflow-hidden rounded-[2rem] border border-border/80 bg-background/80 p-4 shadow-[0_24px_80px_-36px_rgba(28,37,59,0.45)] backdrop-blur md:p-5">
        <AppHeader
          apiBaseUrl={API_BASE_URL}
          badges={[
            { icon: FlaskConical, label: "MVP pipeline" },
            { icon: Cpu, label: "LLVM-aware" },
            { icon: Zap, label: "Heatmapped source" },
          ]}
        />

        <MetricsStrip analysis={analysis} lastRunAt={lastRunAt} />

        <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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

          <AnalysisTabs analysis={analysis} sourceCode={deferredCode} />
        </div>
      </div>
    </main>
  );
}
