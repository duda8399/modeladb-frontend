import { MarkerType } from "reactflow";
import type { CustomEdge, CustomNode } from "../types/diagramER";
import { analyzeViewSql } from "./viewSql";
import { normalizeSqlName } from "./identifiers";

export type ViewSource = [id: string, type: string, name: string, sql: string];

export function viewSources(nodes: CustomNode[]): ViewSource[] {
  return nodes
    .filter((node) => node.type === "entityNode" || node.type === "viewNode")
    .map((node) => {
      const data = node.data as { name?: string; sql?: string } | undefined;
      return [node.id, node.type as string, data?.name ?? "", data?.sql ?? ""];
    });
}

export function buildViewEdges(sources: ViewSource[]): CustomEdge[] {
  const idByName = new Map(sources.map(([nodeId, , name]) => [normalizeSqlName(name), nodeId]));

  return sources
    .filter(([, type]) => type === "viewNode")
    .flatMap(([viewId, , , sql]) =>
      analyzeViewSql(sql)
        .tables.map((table) => idByName.get(normalizeSqlName(table)))
        .filter((sourceId): sourceId is string => !!sourceId && sourceId !== viewId)
        .map((sourceId) => ({
          id: `view-source:${viewId}:${sourceId}`,
          source: sourceId,
          target: viewId,
          type: "viewEdge",
          selectable: false,
          deletable: false,
          focusable: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#90A4AE" },
        })),
    );
}
