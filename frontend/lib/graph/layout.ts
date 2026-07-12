import dagre from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

type LayoutOptions = {
  nodeWidth: number;
  nodeHeight: number;
  rankSeparation?: number;
  nodeSeparation?: number;
};

/**
 * Assigns positions with dagre's layered algorithm, top to bottom.
 *
 * Used for both surfaces: a CFG is a cyclic graph (loop latches jump backwards)
 * and a plain tree layout cannot place it, while dagre breaks cycles for us and
 * lays trees out just as well.
 */
export function layoutGraph<N extends Node, E extends Edge>(
  nodes: N[],
  edges: E[],
  { nodeWidth, nodeHeight, rankSeparation = 64, nodeSeparation = 36 }: LayoutOptions,
): N[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", ranksep: rankSeparation, nodesep: nodeSeparation });

  for (const node of nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const positioned = graph.node(node.id);

    return {
      ...node,
      // dagre positions a node by its center; React Flow by its top-left corner.
      position: {
        x: positioned.x - nodeWidth / 2,
        y: positioned.y - nodeHeight / 2,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}
