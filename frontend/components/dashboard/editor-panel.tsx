"use client";

import dynamic from "next/dynamic";
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
  error: string | null;
  onCodeChange: (value: string) => void;
};

export function EditorPanel({
  code,
  error,
  onCodeChange,
}: EditorPanelProps) {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="border-b px-4 py-3 shrink-0">
        <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground">
          Source editor
        </h2>
      </div>

      <div className="flex flex-1 flex-col relative min-h-0 overflow-hidden">
        <MonacoEditor code={code} onChange={onCodeChange} />
        {error && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t border-destructive/20">
            <Textarea
              readOnly
              value={error}
              className="h-32 resize-none rounded-lg border-destructive/35 bg-destructive/5 font-mono text-sm text-destructive"
            />
          </div>
        )}
      </div>
    </div>
  );
}
