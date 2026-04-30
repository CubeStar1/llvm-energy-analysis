"use client";

import dynamic from "next/dynamic";
import { Play, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MonacoEditor = dynamic(
  () => import("@/components/dashboard/monaco-editor").then((module) => module.MonacoEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[28rem] items-center justify-center rounded-[1.3rem] border border-dashed border-border bg-background/70 font-mono text-sm text-muted-foreground">
        Loading Monaco editor…
      </div>
    ),
  },
);

type EditorPanelProps = {
  code: string;
  std: string;
  compilerFlags: string;
  isBusy: boolean;
  error: string | null;
  onCodeChange: (value: string) => void;
  onStdChange: (value: string) => void;
  onCompilerFlagsChange: (value: string) => void;
  onRunAnalysis: () => void;
};

export function EditorPanel({
  code,
  std,
  compilerFlags,
  isBusy,
  error,
  onCodeChange,
  onStdChange,
  onCompilerFlagsChange,
  onRunAnalysis,
}: EditorPanelProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Input workspace
            </p>
            <h2 className="font-heading text-2xl tracking-[-0.03em] font-semibold">
              Source editor
            </h2>
          </div>

          <Button
            onClick={onRunAnalysis}
            disabled={isBusy}
            size="lg"
            className="rounded-xl px-4 shadow-xs"
          >
            {isBusy ? <RefreshCcw className="animate-spin" /> : <Play />}
            Run analysis
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)]">
          <label className="space-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Language standard
            </span>
            <Input value={std} onChange={(event) => onStdChange(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Compiler flags
            </span>
            <Input
              value={compilerFlags}
              onChange={(event) => onCompilerFlagsChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 min-h-[30rem]">
        <MonacoEditor code={code} onChange={onCodeChange} />
        {error ? (
          <Textarea
            readOnly
            value={error}
            className="min-h-24 resize-none rounded-[1.1rem] border-destructive/35 bg-destructive/5 font-mono text-sm text-destructive"
          />
        ) : null}
      </div>
    </div>
  );
}
