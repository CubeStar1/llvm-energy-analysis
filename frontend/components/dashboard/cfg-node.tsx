"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Repeat2 } from "lucide-react";
import { heatBackground, heatBorder, heatColor, heatLevel } from "@/lib/graph/heat";
import type { CfgBlock } from "@/lib/types";

export type CfgNodeData = {
  block: CfgBlock;
  maxWeightedEnergy: number;
  isSelected: boolean;
};

export type CfgFlowNode = Node<CfgNodeData, "cfgBlock">;

export const CFG_NODE_WIDTH = 236;
export const CFG_NODE_HEIGHT = 104;

export function CfgNode({ data }: NodeProps<CfgFlowNode>) {
  const { block, maxWeightedEnergy, isSelected } = data;
  const level = heatLevel(block.weightedEnergy, maxWeightedEnergy);
  const fill =
    maxWeightedEnergy > 0 ? (block.weightedEnergy / maxWeightedEnergy) * 100 : 0;

  return (
    <div
      className="rounded-xl border px-3 py-2.5 shadow-sm transition-shadow"
      style={{
        width: CFG_NODE_WIDTH,
        height: CFG_NODE_HEIGHT,
        background: heatBackground(level),
        borderColor: isSelected ? "var(--ring)" : heatBorder(level),
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-muted-foreground"
      />
      {/* Back edges enter and leave on the right so they can loop around the
          outside of the block instead of collapsing onto the forward edges —
          a self-loop latch would otherwise be a zero-length path. */}
      <Handle
        id="back-in"
        type="target"
        position={Position.Right}
        style={{ top: "30%" }}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <Handle
        id="back-out"
        type="source"
        position={Position.Right}
        style={{ top: "70%" }}
        className="!size-1.5 !border-0 !bg-transparent"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold text-foreground">
          {block.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {block.isEntry && (
            <span className="rounded-full border border-border/70 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              entry
            </span>
          )}
          {block.isLoopHeader && (
            <span className="flex items-center gap-0.5 rounded-full border border-border/70 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              <Repeat2 className="size-2.5" />
              loop
            </span>
          )}
          {block.frequencyWeight > 1 && (
            <span
              className="rounded-full px-1.5 py-px font-mono text-[10px] font-semibold text-background"
              style={{ background: heatColor(Math.max(level, 1) as 1 | 2 | 3 | 4) }}
              title={`loop depth ${block.loopDepth} → ${block.frequencyWeight}× frequency weight`}
            >
              {block.frequencyWeight}×
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${fill}%`, background: heatColor(level) }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-foreground">
          {block.weightedEnergy.toFixed(1)} e
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
        {block.instructionCount} instr · raw {block.rawEnergy.toFixed(1)}
        {block.line > 0 && ` · L${block.line}`}
      </p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {block.topOpcodes.slice(0, 3).join(" · ") || "—"}
      </p>

      <Handle
        id="out"
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-muted-foreground"
      />
    </div>
  );
}
