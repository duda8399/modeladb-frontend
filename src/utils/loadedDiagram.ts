import type { CustomEdge, CustomNode } from "../types/diagramER";

export function normalizeLoadedEdges(nodes: CustomNode[], edges: CustomEdge[]): CustomEdge[] {
  return edges.map((edge) => {
    const normalized = { ...edge, type: "floating" };

    if (edge.data) return normalized;

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const sourceName = (sourceNode?.data as { name?: string } | undefined)?.name || edge.source;

    return {
      ...normalized,
      data: {
        relationType: "1:1",
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        fkFieldName: `fk_${sourceName}_id`,
      },
    } as CustomEdge;
  });
}
