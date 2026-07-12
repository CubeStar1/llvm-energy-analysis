"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useState } from "react";
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
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CfgBackEdge } from "@/components/dashboard/cfg-back-edge";
import {
  CFG_NODE_HEIGHT,
  CFG_NODE_WIDTH,
  CfgNode,
  formatFrequency,
  type CfgFlowNode,
} from "@/components/dashboard/cfg-node";
import { layoutGraph } from "@/lib/graph/layout";
import type { CfgBlock, CfgFunction } from "@/lib/types";

type CfgPanelProps = {
  cfg: CfgFunction[];
};

const nodeTypes = { cfgBlock: CfgNode };
const edgeTypes = { backEdge: CfgBackEdge };

export function CfgPanel({ cfg }: CfgPanelProps) {
  // The backend sorts functions by energy, so the first one is the hottest.
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedFunction(cfg[0]?.function ?? null);
    setSelectedBlockId(null);
  }, [cfg]);

  const active =
    cfg.find((entry) => entry.function === selectedFunction) ?? cfg[0] ?? null;

  const { nodes, edges } = useMemo(() => {
    if (!active) {
      return { nodes: [] as CfgFlowNode[], edges: [] as Edge[] };
    }

    const maxWeightedEnergy = Math.max(
      ...active.blocks.map((block) => block.weightedEnergy),
      0,
    );

    const rawNodes: CfgFlowNode[] = active.blocks.map((block) => ({
      id: String(block.id),
      type: "cfgBlock",
      position: { x: 0, y: 0 },
      data: {
        block,
        maxWeightedEnergy,
        isSelected: block.id === selectedBlockId,
      },
    }));

    const flowEdges: Edge[] = active.edges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: String(edge.source),
      target: String(edge.target),
      ...(edge.isBackEdge
        ? {
            type: "backEdge",
            sourceHandle: "back-out",
            targetHandle: "back-in",
            animated: true,
            style: {
              stroke: "var(--heat-4)",
              strokeWidth: 2,
              strokeDasharray: "5 4",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: "var(--heat-4)",
            },
          }
        : {
            type: "smoothstep",
            sourceHandle: "out",
            targetHandle: "in",
            style: {
              stroke: "var(--muted-foreground)",
              strokeWidth: 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: "var(--muted-foreground)",
            },
          }),
    }));

    return {
      // Back edges are the cycles in the graph. Feeding them to dagre would
      // make it break the cycle by reversing an edge of its choosing, which
      // scrambles the block order; rank on the forward edges only.
      nodes: layoutGraph(
        rawNodes,
        flowEdges.filter((edge) => edge.type !== "backEdge"),
        {
          nodeWidth: CFG_NODE_WIDTH,
          nodeHeight: CFG_NODE_HEIGHT,
        },
      ),
      edges: flowEdges,
    };
  }, [active, selectedBlockId]);

  const selectedBlock =
    active?.blocks.find((block) => block.id === selectedBlockId) ?? null;

  if (cfg.length === 0) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-[1.4rem] border border-border/70 bg-background/85">
        <p className="text-sm text-muted-foreground">
          Run analysis to build the control flow graph.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-[22rem] gap-2">
              <span className="truncate font-mono text-xs">{active?.function}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-96 overflow-y-auto">
            {cfg.map((entry) => (
              <DropdownMenuItem
                key={entry.function}
                onSelect={() => {
                  setSelectedFunction(entry.function);
                  setSelectedBlockId(null);
                }}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate font-mono text-xs">{entry.function}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {entry.weightedEnergy.toFixed(1)} e · {entry.blocks.length} bb
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <p
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          title={
            active?.frequencyModel === "loop-depth"
              ? "Compiled at -O0, where LLVM computes no branch probabilities. Frequencies fall back to the loop-depth heuristic: 10× per level of loop nesting."
              : "Frequencies come from LLVM's block-frequency analysis: expected executions per call, derived from branch probabilities."
          }
        >
          {active?.blocks.length ?? 0} blocks · dashed = back edge · n× ={" "}
          {active?.frequencyModel === "loop-depth"
            ? "loop-depth estimate (-O0)"
            : "expected runs per call"}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/85">
          <CfgCanvas
            nodes={nodes}
            edges={edges}
            onSelectBlock={setSelectedBlockId}
          />
        </div>

        {selectedBlock && (
          <BlockDetails
            block={selectedBlock}
            onClose={() => setSelectedBlockId(null)}
          />
        )}
      </div>
    </div>
  );
}

function CfgCanvas({
  nodes,
  edges,
  onSelectBlock,
}: {
  nodes: CfgFlowNode[];
  edges: Edge[];
  onSelectBlock: (id: number | null) => void;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => onSelectBlock(Number(node.id))}
        onPaneClick={() => onSelectBlock(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}

function BlockDetails({
  block,
  onClose,
}: {
  block: CfgBlock;
  onClose: () => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-[1.4rem] border border-border/70 bg-card/75">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <span className="font-mono text-sm font-semibold">{block.name}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 font-mono text-[11px]">
        <Metric label="weighted" value={`${block.weightedEnergy.toFixed(2)} e`} />
        <Metric label="raw" value={`${block.rawEnergy.toFixed(2)} e`} />
        <Metric
          label="runs / call"
          value={`${formatFrequency(block.frequencyWeight)}×`}
        />
        <Metric label="loop depth" value={String(block.loopDepth)} />
        <Metric label="instructions" value={String(block.instructionCount)} />
        <Metric label="fallback" value={String(block.fallbackInstructionCount)} />
        {block.line > 0 && (
          <Metric
            label="source"
            value={
              block.endLine > block.line
                ? `L${block.line}–${block.endLine}`
                : `L${block.line}`
            }
          />
        )}
      </div>

      <div className="border-t border-border/70 px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Instructions
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 pb-4">
          {block.instructions.map((instruction, index) => (
            <div
              key={`${instruction.opcode}-${index}`}
              className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1 font-mono text-[11px] last:border-b-0"
            >
              <span className="truncate text-foreground">{instruction.opcode}</span>
              <span className="shrink-0 text-muted-foreground">
                {instruction.bucket} · {instruction.cost.toFixed(1)}
              </span>
            </div>
          ))}
          {block.instructionsTruncated && (
            <p className="pt-2 font-mono text-[10px] text-muted-foreground">
              + {block.instructionCount - block.instructions.length} more
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
