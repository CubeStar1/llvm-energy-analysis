"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  AST_NODE_HEIGHT,
  AST_NODE_WIDTH,
  AstNode,
  type AstFlowNode,
} from "@/components/dashboard/ast-node";
import { layoutGraph } from "@/lib/graph/layout";
import type { AstNode as AstNodeType } from "@/lib/types";

type AstPanelProps = {
  ast: AstNodeType | null;
};

const nodeTypes = { astNode: AstNode };

/** Expressions below a statement add depth without adding much insight, so the
 *  tree opens at statement level and the user drills in from there. */
const DEFAULT_OPEN_DEPTH = 3;

export function AstPanel({ ast }: AstPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const defaultCollapsed = useMemo(() => {
    const ids = new Set<string>();
    if (!ast) {
      return ids;
    }

    const walk = (node: AstNodeType, depth: number) => {
      if (depth >= DEFAULT_OPEN_DEPTH && node.children.length > 0) {
        ids.add(node.id);
      }
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    };
    walk(ast, 0);
    return ids;
  }, [ast]);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  const maxSubtreeEnergy = useMemo(() => {
    if (!ast) {
      return 0;
    }
    // The root spans the whole file, so its energy is the total — comparing
    // every node against that would wash the whole tree out. Rank against the
    // hottest node *below* the root instead.
    let max = 0;
    const walk = (node: AstNodeType, depth: number) => {
      if (depth > 0) {
        max = Math.max(max, node.subtreeEnergy);
      }
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    };
    walk(ast, 0);
    return max;
  }, [ast]);

  const { nodes, edges } = useMemo(() => {
    if (!ast) {
      return { nodes: [] as AstFlowNode[], edges: [] as Edge[] };
    }

    const flowNodes: AstFlowNode[] = [];
    const flowEdges: Edge[] = [];

    const walk = (node: AstNodeType, parentId: string | null) => {
      const isCollapsed = collapsed.has(node.id);

      flowNodes.push({
        id: node.id,
        type: "astNode",
        position: { x: 0, y: 0 },
        data: {
          node,
          maxSubtreeEnergy,
          hiddenChildCount: node.children.length,
          isCollapsed,
        },
      });

      if (parentId !== null) {
        flowEdges.push({
          id: `${parentId}->${node.id}`,
          source: parentId,
          target: node.id,
          type: "smoothstep",
          style: { stroke: "var(--muted-foreground)", strokeWidth: 1.2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: "var(--muted-foreground)",
          },
        });
      }

      if (isCollapsed) {
        return;
      }
      for (const child of node.children) {
        walk(child, node.id);
      }
    };

    walk(ast, null);

    return {
      nodes: layoutGraph(flowNodes, flowEdges, {
        nodeWidth: AST_NODE_WIDTH,
        nodeHeight: AST_NODE_HEIGHT,
        rankSeparation: 48,
        nodeSeparation: 24,
      }),
      edges: flowEdges,
    };
  }, [ast, collapsed, maxSubtreeEnergy]);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (!ast) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-[1.4rem] border border-border/70 bg-background/85">
        <p className="text-sm text-muted-foreground">
          Run analysis to parse the abstract syntax tree.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            Expand all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(defaultCollapsed)}
          >
            Collapse
          </Button>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {nodes.length} nodes shown · click to expand · tint = subtree energy
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/85">
        <AstCanvas nodes={nodes} edges={edges} onToggle={toggle} />
      </div>
    </div>
  );
}

function AstCanvas({
  nodes,
  edges,
  onToggle,
}: {
  nodes: AstFlowNode[];
  edges: Edge[];
  onToggle: (id: string) => void;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => onToggle(node.id)}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
