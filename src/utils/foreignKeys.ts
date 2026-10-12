import type { Field } from "../types/diagramER";

type FkEdgeData = {
  relationType?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  junctionId?: string;
  fkFieldName?: string;
  fkFieldId?: string;
  deleted?: boolean;
};

export type FkNodeLike = {
  id: string;
  type?: string;
  data: { name?: string; fields?: (Field & { deleted?: boolean })[] } | Record<string, unknown>;
};

export type FkEdgeLike = {
  id: string;
  source: string;
  target: string;
  data?: FkEdgeData | null;
};

export type DirectFkLink = {
  edgeId: string;
  parentId: string;
  childId: string;
  field: Field | null;
  matchedBy: "id" | "name" | "fallback" | null;
};

const lower = (value: string | null | undefined) => (value ?? "").toLowerCase();

function liveFields(node: FkNodeLike | undefined): Field[] {
  const fields = ((node?.data as { fields?: (Field & { deleted?: boolean })[] })?.fields ?? []) as (Field & {
    deleted?: boolean;
  })[];
  return fields.filter((field) => !field.deleted);
}

function nodeName(node: FkNodeLike | undefined): string {
  return ((node?.data as { name?: string })?.name ?? node?.id ?? "") as string;
}

export function isDirectFkEdge(edge: FkEdgeLike): boolean {
  const data = edge.data;
  return !!data && !data.deleted && !data.junctionId;
}

export function matchDirectFkField(
  data: FkEdgeData | null | undefined,
  fields: Field[],
  parentName: string,
): { field: Field; matchedBy: "id" | "name" } | null {
  if (!data) return null;

  if (data.fkFieldId) {
    const byId = fields.find((field) => field.id === data.fkFieldId);
    if (byId) return { field: byId, matchedBy: "id" };
  }

  const expected = lower(data.fkFieldName || `fk_${parentName}_id`);
  const byName =
    fields.find((field) => field.fk && lower(field.name) === expected) ??
    fields.find((field) => lower(field.name) === expected);
  return byName ? { field: byName, matchedBy: "name" } : null;
}

export function resolveDirectFkLinks(nodes: FkNodeLike[], edges: FkEdgeLike[]): Map<string, DirectFkLink> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links = new Map<string, DirectFkLink>();
  const claimed = new Set<string>();
  const pending: DirectFkLink[] = [];

  for (const edge of edges) {
    if (!isDirectFkEdge(edge)) continue;
    const data = edge.data!;
    const parentId = data.sourceNodeId ?? edge.source;
    const childId = data.targetNodeId ?? edge.target;
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    if (!child || !parent) continue;

    const match = matchDirectFkField(data, liveFields(child), nodeName(parent));
    const link: DirectFkLink = {
      edgeId: edge.id,
      parentId,
      childId,
      field: match?.field ?? null,
      matchedBy: match?.matchedBy ?? null,
    };
    links.set(edge.id, link);
    if (match) claimed.add(`${childId}:${match.field.id}`);
    else pending.push(link);
  }

  const junctionFieldIds = new Set<string>();
  for (const edge of edges) {
    const junctionId = edge.data?.junctionId;
    if (!junctionId || edge.data?.deleted) continue;
    for (const field of liveFields(byId.get(junctionId))) if (field.fk) junctionFieldIds.add(`${junctionId}:${field.id}`);
  }

  for (const link of pending) {
    const candidate = liveFields(byId.get(link.childId)).find((field) => {
      const key = `${link.childId}:${field.id}`;
      return field.fk && !claimed.has(key) && !junctionFieldIds.has(key);
    });
    if (!candidate) continue;
    claimed.add(`${link.childId}:${candidate.id}`);
    link.field = candidate;
    link.matchedBy = "fallback";
  }

  return links;
}

export type JunctionFkLink = {
  junctionId: string;
  parentId: string;
  edgeId: string;
  field: Field | null;
};

export function resolveJunctionFkLinks(nodes: FkNodeLike[], edges: FkEdgeLike[]): JunctionFkLink[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: JunctionFkLink[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const data = edge.data;
    if (!data?.junctionId || data.deleted || seen.has(data.junctionId)) continue;
    seen.add(data.junctionId);

    const junction = byId.get(data.junctionId);
    if (!junction) continue;
    const fkFields = liveFields(junction).filter((field) => field.fk);
    const siblings = edges.filter((e) => e.data?.junctionId === data.junctionId && !e.data?.deleted);
    const sides = [
      { parentId: data.sourceNodeId, edge: siblings.find((e) => e.target === junction.id) },
      { parentId: data.targetNodeId, edge: siblings.find((e) => e.source === junction.id) },
    ];

    const used = new Set<string>();
    const matched = sides.map((side) => {
      const parent = side.parentId ? byId.get(side.parentId) : undefined;
      const expected = `fk_${lower(nodeName(parent))}_id`;
      const field = parent ? fkFields.find((f) => lower(f.name) === expected && !used.has(f.id)) : undefined;
      if (field) used.add(field.id);
      return field ?? null;
    });

    sides.forEach((side, index) => {
      if (!side.parentId || !byId.get(side.parentId)) return;
      const field = matched[index] ?? fkFields.find((f) => !used.has(f.id)) ?? null;
      if (field) used.add(field.id);
      result.push({
        junctionId: junction.id,
        parentId: side.parentId,
        edgeId: side.edge?.id ?? edge.id,
        field,
      });
    });
  }

  return result;
}
