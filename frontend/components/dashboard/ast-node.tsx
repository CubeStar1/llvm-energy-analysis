"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { heatBackground, heatBorder, heatColor, heatLevel } from "@/lib/graph/heat";
import type { AstNode as AstNodeType } from "@/lib/types";

export type AstNodeData = {
  node: AstNodeType;
  maxSubtreeEnergy: number;
  hiddenChildCount: number;
  isCollapsed: boolean;
};

export type AstFlowNode = Node<AstNodeData, "astNode">;

export const AST_NODE_WIDTH = 210;
export const AST_NODE_HEIGHT = 76;

export function AstNode({ data }: NodeProps<AstFlowNode>) {
  const { node, maxSubtreeEnergy, hiddenChildCount, isCollapsed } = data;
  const level = heatLevel(node.subtreeEnergy, maxSubtreeEnergy);

  return (
    <div
      className="rounded-xl border px-3 py-2 shadow-sm"
      style={{
        width: AST_NODE_WIDTH,
        height: AST_NODE_HEIGHT,
        background: heatBackground(level),
        borderColor: heatBorder(level),
      }}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-muted-foreground" />

      <div className="flex items-center gap-1">
        {hiddenChildCount > 0 && (
          <span className="shrink-0 text-muted-foreground">
            {isCollapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </span>
        )}
        <span className="truncate font-mono text-xs font-semibold text-foreground">
          {node.kind}
        </span>
      </div>

      <p className="truncate font-mono text-[11px] text-foreground">
        {node.label ? node.label : <span className="text-muted-foreground">—</span>}
        {node.detail && (
          <span className="text-muted-foreground"> : {node.detail}</span>
        )}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <span>{node.line > 0 ? `L${node.line}` : ""}</span>
        <span className="flex items-center gap-1">
          {node.subtreeEnergy > 0 && (
            <span
              className="size-1.5 rounded-full"
              style={{ background: heatColor(level) }}
            />
          )}
          {node.subtreeEnergy > 0 ? `${node.subtreeEnergy.toFixed(1)} e` : "—"}
          {isCollapsed && hiddenChildCount > 0 && ` · +${hiddenChildCount}`}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-muted-foreground" />
    </div>
  );
}
