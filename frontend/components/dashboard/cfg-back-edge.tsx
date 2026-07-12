"use client";

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

/**
 * A loop latch jumping back to its header.
 *
 * React Flow's built-in edge types cannot draw these: a self-loop (`bb.3 -> bb.3`,
 * the common case for a latch that is its own header) has its source and target
 * at the same point and collapses to nothing, and a latch jumping to an earlier
 * block would be drawn straight through the blocks in between. Both are routed
 * here as a curve bulging out to the right of the graph, so the cycle is
 * visible as a cycle.
 */
export function CfgBackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
}: EdgeProps) {
  const span = Math.abs(sourceY - targetY);
  const bulge = Math.max(56, span * 0.4);
  const controlX = Math.max(sourceX, targetX) + bulge;

  const path = `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${targetY} ${targetX},${targetY}`;
  const labelX = controlX - bulge * 0.25;
  const labelY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em]"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "var(--background)",
            borderColor: "var(--heat-4)",
            color: "var(--heat-4)",
          }}
        >
          back edge
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
