"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { PipelineNodeKind, PipelineStage } from "./pipeline-data";

export type PipelineNodeData = {
  stage: PipelineStage;
  isSelected: boolean;
  stepIndex: number;
};

export type PipelineFlowNode = Node<PipelineNodeData, "pipelineStage">;

export const PIPELINE_NODE_WIDTH = 236;
export const PIPELINE_NODE_HEIGHT = 96;

const KIND_STYLES: Record<
  PipelineNodeKind,
  { container: string; iconBox: string; label: string }
> = {
  artifact: {
    container: "border-dashed border-border bg-card/80",
    iconBox: "bg-muted text-muted-foreground",
    label: "artifact",
  },
  tool: {
    container: "border-border bg-card",
    iconBox: "bg-primary/10 text-primary",
    label: "tool",
  },
  pass: {
    container:
      "border-primary/60 bg-card shadow-[0_0_24px_-6px_var(--primary)]",
    iconBox: "bg-primary text-primary-foreground",
    label: "llvm pass",
  },
  output: {
    container: "border-border bg-card",
    iconBox: "text-background",
    label: "output",
  },
  app: {
    container: "border-border bg-card",
    iconBox: "bg-primary/10 text-primary",
    label: "frontend",
  },
};

/** Invisible connection points on all four sides so edges can route cleanly
 *  through the serpentine layout. */
function EdgeHandles() {
  const hidden = "!size-1 !border-0 !bg-transparent !min-w-0 !min-h-0";
  return (
    <>
      <Handle id="t-top" type="target" position={Position.Top} className={hidden} />
      <Handle id="t-left" type="target" position={Position.Left} className={hidden} />
      <Handle id="t-right" type="target" position={Position.Right} className={hidden} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className={hidden} />
      <Handle id="s-left" type="source" position={Position.Left} className={hidden} />
      <Handle id="s-right" type="source" position={Position.Right} className={hidden} />
    </>
  );
}

export function PipelineNode({ data }: NodeProps<PipelineFlowNode>) {
  const { stage, isSelected, stepIndex } = data;
  const styles = KIND_STYLES[stage.kind];
  const Icon = stage.icon;

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col justify-between rounded-xl border px-3.5 py-3 transition-all duration-200",
        styles.container,
        isSelected
          ? "border-primary ring-2 ring-primary/40 shadow-lg"
          : "hover:border-primary/50 hover:shadow-md",
      )}
      style={{ width: PIPELINE_NODE_WIDTH, height: PIPELINE_NODE_HEIGHT }}
    >
      <EdgeHandles />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              styles.iconBox,
            )}
            style={
              stage.kind === "output" ? { background: "var(--heat-3)" } : undefined
            }
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
              {stage.title}
            </p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {stage.subtitle}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {String(stepIndex + 1).padStart(2, "0")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] text-muted-foreground">{stage.blurb}</p>
        <span
          className={cn(
            "shrink-0 font-mono text-[9px] uppercase tracking-[0.12em]",
            stage.kind === "pass" ? "text-primary" : "text-muted-foreground/70",
          )}
        >
          {styles.label}
        </span>
      </div>

      {stage.kind === "pass" && (
        <span className="pointer-events-none absolute -inset-px animate-pulse rounded-xl border border-primary/30" />
      )}
    </div>
  );
}
