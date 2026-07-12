"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PIPELINE_NODE_HEIGHT,
  PIPELINE_NODE_WIDTH,
  PipelineNode,
  type PipelineFlowNode,
} from "./pipeline-node";
import { PIPELINE_STAGES, STAGE_ORDER, getStage } from "./pipeline-data";

/** Hand-placed serpentine layout: compile row flows left→right, drops through
 *  the pass into its two output channels, then the serving row flows back
 *  right→left. Reads like the actual data flow. */
const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  source: { x: 0, y: 40 },
  clang: { x: 300, y: 40 },
  ir: { x: 600, y: 40 },
  llc: { x: 900, y: 40 },
  mir: { x: 1200, y: 40 },
  pass: { x: 1500, y: 40 },
  model: { x: 1500, y: -170 },
  json: { x: 1320, y: 300 },
  yaml: { x: 1660, y: 300 },
  report: { x: 1490, y: 560 },
};

type AnnotationNode = Node<{ label: string }, "annotation">;

const ANNOTATIONS: AnnotationNode[] = [
  {
    id: "note-compile",
    type: "annotation",
    position: { x: 0, y: -6 },
    data: { label: "① Compile & lower" },
    selectable: false,
    draggable: false,
  },
  {
    id: "note-analyze",
    type: "annotation",
    position: { x: 1320, y: 256 },
    data: { label: "② Analyze & emit" },
    selectable: false,
    draggable: false,
  },
  {
    id: "note-serve",
    type: "annotation",
    position: { x: 1490, y: 520 },
    data: { label: "③ Visualize" },
    selectable: false,
    draggable: false,
  },
];

function AnnotationNodeView({ data }: { data: { label: string } }) {
  return (
    <div className="pointer-events-none font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
      {data.label}
    </div>
  );
}

const nodeTypes = {
  pipelineStage: PipelineNode,
  annotation: AnnotationNodeView,
};

const chainMarker = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: "var(--muted-foreground)",
};

function chainEdge(source: string, target: string, horizontal = true): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: horizontal ? "s-right" : "s-bottom",
    targetHandle: horizontal ? "t-left" : "t-top",
    type: "smoothstep",
    animated: true,
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
    markerEnd: chainMarker,
  };
}

const EDGES: Edge[] = [
  chainEdge("source", "clang"),
  chainEdge("clang", "ir"),
  chainEdge("ir", "llc"),
  chainEdge("llc", "mir"),
  chainEdge("mir", "pass"),
  {
    id: "model->pass",
    source: "model",
    target: "pass",
    sourceHandle: "s-bottom",
    targetHandle: "t-top",
    type: "smoothstep",
    label: "-energy-model=…",
    labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
    style: { stroke: "var(--primary)", strokeWidth: 1.5, strokeDasharray: "5 4" },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--primary)" },
  },
  {
    id: "pass->json",
    source: "pass",
    target: "json",
    sourceHandle: "s-bottom",
    targetHandle: "t-top",
    type: "smoothstep",
    animated: true,
    label: "stderr",
    labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
    style: { stroke: "var(--heat-3)", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--heat-3)" },
  },
  {
    id: "pass->yaml",
    source: "pass",
    target: "yaml",
    sourceHandle: "s-bottom",
    targetHandle: "t-top",
    type: "smoothstep",
    animated: true,
    label: "remarks",
    labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
    style: { stroke: "var(--heat-3)", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--heat-3)" },
  },
  chainEdge("json", "report", false),
  chainEdge("yaml", "report", false),
];

export function PipelineFlow() {
  const [selectedId, setSelectedId] = useState<string>("source");
  const selectedStage = getStage(selectedId) ?? PIPELINE_STAGES[0];
  const stepIndex = STAGE_ORDER.indexOf(selectedStage.id);

  const nodes = useMemo<Node[]>(() => {
    const stageNodes: PipelineFlowNode[] = PIPELINE_STAGES.map((stage) => ({
      id: stage.id,
      type: "pipelineStage",
      position: STAGE_POSITIONS[stage.id],
      data: {
        stage,
        isSelected: stage.id === selectedId,
        stepIndex: STAGE_ORDER.indexOf(stage.id),
      },
      draggable: false,
      connectable: false,
    }));
    return [...ANNOTATIONS, ...stageNodes];
  }, [selectedId]);

  const goTo = useCallback((index: number) => {
    const clamped = Math.min(Math.max(index, 0), STAGE_ORDER.length - 1);
    setSelectedId(STAGE_ORDER[clamped]);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Stage chips: jump anywhere; doubles as a progress rail for walking
          through the pipeline while presenting. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PIPELINE_STAGES.map((stage, index) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => setSelectedId(stage.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors",
              stage.id === selectedId
                ? "border-primary bg-primary text-primary-foreground"
                : index < stepIndex
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {index + 1}
            <span className="ml-1 hidden lg:inline">{stage.title}</span>
          </button>
        ))}
      </div>

      <div className="h-[440px] overflow-hidden rounded-2xl border border-border/60 bg-card/50 md:h-[520px]">
        <ReactFlowProvider>
          <PipelineCanvas
            nodes={nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </ReactFlowProvider>
      </div>

      {/* Detail panel for the selected stage. */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 md:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedStage.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="grid gap-5 lg:grid-cols-[1.2fr_1fr]"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                  stage {String(stepIndex + 1).padStart(2, "0")} / {STAGE_ORDER.length}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {selectedStage.subtitle}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {selectedStage.detail.heading}
              </h3>
              <ul className="space-y-2">
                {selectedStage.detail.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              {selectedStage.detail.code && (
                <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                  <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {selectedStage.detail.code.label}
                    </span>
                    <span className="flex gap-1">
                      <span className="size-2 rounded-full bg-border" />
                      <span className="size-2 rounded-full bg-border" />
                      <span className="size-2 rounded-full bg-border" />
                    </span>
                  </div>
                  <pre className="overflow-x-auto p-3.5 font-mono text-[11.5px] leading-relaxed text-foreground">
                    {selectedStage.detail.code.content}
                  </pre>
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={stepIndex === 0}
                  onClick={() => goTo(stepIndex - 1)}
                >
                  <ArrowLeft className="size-3.5" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={stepIndex === STAGE_ORDER.length - 1}
                  onClick={() => goTo(stepIndex + 1)}
                >
                  Next stage
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function PipelineCanvas({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: Node[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const { setCenter } = useReactFlow();

  // Glide the camera to whichever stage is selected — from a chip, a node
  // click, or the previous/next buttons. The first render keeps the fitView
  // overview instead of zooming straight into stage one.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const position = STAGE_POSITIONS[selectedId];
    if (!position) return;
    const timer = window.setTimeout(() => {
      setCenter(
        position.x + PIPELINE_NODE_WIDTH / 2,
        position.y + PIPELINE_NODE_HEIGHT / 2,
        { zoom: 1, duration: 650 },
      );
    }, 60);
    return () => window.clearTimeout(timer);
  }, [selectedId, setCenter]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={EDGES}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_event, node) => {
        if (node.type === "pipelineStage") onSelect(node.id);
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
