import type { CustomEdge, CustomNode, Field, TableCheck, TableIndex } from "../types/diagramER";
import { formatTypeWithSize } from "./sqlTypes";

export type DiagramSnapshot = {
  name?: string | null;
  nodes: CustomNode[];
  edges: CustomEdge[];
};

export type ChangeKind = "added" | "removed" | "changed";

export type DiagramChange = {
  kind: ChangeKind;
  scope: "diagram" | "table" | "column" | "index" | "check" | "view" | "relation" | "annotation";
  text: string;
};

type EntityData = { name?: string; fields?: Field[]; indexes?: TableIndex[]; checks?: TableCheck[] };
type ViewData = { name?: string; sql?: string };

const ANNOTATION_TYPES = new Set(["noteNode", "textNode", "sectionNode"]);

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));

const tableName = (node: CustomNode | undefined) => (node?.data as EntityData | undefined)?.name || "sem nome";

function fieldFlags(field: Field): string[] {
  return [
    field.pk && "PK",
    field.fk && "FK",
    field.notNull && "NOT NULL",
    field.unique && "UNIQUE",
    field.ai && "AUTO_INCREMENT",
  ].filter(Boolean) as string[];
}

function describeField(field: Field): string {
  const type = formatTypeWithSize(field.type, field.size) || "sem tipo";
  const extras = [...fieldFlags(field), field.defaultValue ? `DEFAULT ${field.defaultValue}` : null].filter(Boolean);
  return [type, ...extras].join(" ");
}

function fieldChanges(before: Field, after: Field): string[] {
  const changes: string[] = [];
  if ((before.name ?? "") !== (after.name ?? "")) changes.push(`renomeada de ${before.name || "sem nome"}`);

  const typeBefore = formatTypeWithSize(before.type, before.size);
  const typeAfter = formatTypeWithSize(after.type, after.size);
  if (typeBefore !== typeAfter) changes.push(`tipo ${typeBefore || "vazio"} → ${typeAfter || "vazio"}`);

  const flagsBefore = new Set(fieldFlags(before));
  const flagsAfter = new Set(fieldFlags(after));
  for (const flag of flagsAfter) if (!flagsBefore.has(flag)) changes.push(`+${flag}`);
  for (const flag of flagsBefore) if (!flagsAfter.has(flag)) changes.push(`−${flag}`);

  if ((before.defaultValue ?? "") !== (after.defaultValue ?? "")) {
    changes.push(`padrão ${before.defaultValue || "nenhum"} → ${after.defaultValue || "nenhum"}`);
  }
  return changes;
}

function indexText(index: TableIndex, fields: Map<string, Field>): string {
  const columns = index.columns.map((id) => fields.get(id)?.name ?? "?").join(", ");
  return `${index.unique ? "índice único" : "índice"} ${index.name} (${columns})`;
}

function relationText(edge: CustomEdge, nodes: Map<string, CustomNode>): string {
  const data = edge.data;
  if (data?.junctionId) {
    return `${tableName(nodes.get(data.sourceNodeId ?? ""))} ↔ ${tableName(nodes.get(data.targetNodeId ?? ""))} (N:N)`;
  }
  const source = tableName(nodes.get(data?.sourceNodeId ?? edge.source));
  const target = tableName(nodes.get(data?.targetNodeId ?? edge.target));
  return `${source} → ${target} (${data?.relationType ?? edge.label ?? "1:N"})`;
}

function relationEdges(edges: CustomEdge[]): CustomEdge[] {
  const seenJunctions = new Set<string>();
  return edges.filter((edge) => {
    const junctionId = edge.data?.junctionId;
    if (!junctionId) return true;
    if (seenJunctions.has(junctionId)) return false;
    seenJunctions.add(junctionId);
    return true;
  });
}

function relationKey(edge: CustomEdge): string {
  return edge.data?.junctionId ? `junction:${edge.data.junctionId}` : edge.id;
}

function actionsOf(edges: CustomEdge[], edge: CustomEdge): string {
  const group = edge.data?.junctionId ? edges.filter((e) => e.data?.junctionId === edge.data?.junctionId) : [edge];
  return group
    .map((e) => `${e.data?.onDelete ?? "padrão"}/${e.data?.onUpdate ?? "padrão"}`)
    .sort()
    .join(",");
}

export function diffDiagrams(from: DiagramSnapshot, to: DiagramSnapshot): DiagramChange[] {
  const changes: DiagramChange[] = [];
  const push = (kind: ChangeKind, scope: DiagramChange["scope"], text: string) => changes.push({ kind, scope, text });

  if ((from.name ?? "") !== (to.name ?? "")) {
    push("changed", "diagram", `Nome do diagrama: ${from.name || "sem nome"} → ${to.name || "sem nome"}`);
  }

  const fromNodes = byId(from.nodes);
  const toNodes = byId(to.nodes);

  for (const node of to.nodes) {
    const before = fromNodes.get(node.id);
    if (node.type === "entityNode") {
      const after = node.data as EntityData;
      if (!before) {
        push("added", "table", `Tabela ${after.name || "sem nome"} criada`);
        continue;
      }
      const old = before.data as EntityData;
      const label = after.name || "sem nome";
      if ((old.name ?? "") !== (after.name ?? "")) {
        push("changed", "table", `Tabela ${old.name || "sem nome"} renomeada para ${label}`);
      }

      const oldFields = byId(old.fields ?? []);
      const newFields = byId(after.fields ?? []);
      for (const field of after.fields ?? []) {
        const previous = oldFields.get(field.id);
        if (!previous) push("added", "column", `${label}.${field.name || "sem nome"} criada: ${describeField(field)}`);
        else {
          const diff = fieldChanges(previous, field);
          if (diff.length) push("changed", "column", `${label}.${field.name || "sem nome"}: ${diff.join(", ")}`);
        }
      }
      for (const field of old.fields ?? []) {
        if (!newFields.has(field.id)) push("removed", "column", `${label}.${field.name || "sem nome"} removida`);
      }

      const oldIndexes = byId(old.indexes ?? []);
      const newIndexes = byId(after.indexes ?? []);
      for (const index of after.indexes ?? []) {
        const previous = oldIndexes.get(index.id);
        if (!previous) push("added", "index", `${label}: ${indexText(index, newFields)} criado`);
        else if (indexText(previous, oldFields) !== indexText(index, newFields)) {
          push("changed", "index", `${label}: ${indexText(previous, oldFields)} → ${indexText(index, newFields)}`);
        }
      }
      for (const index of old.indexes ?? []) {
        if (!newIndexes.has(index.id)) push("removed", "index", `${label}: ${indexText(index, oldFields)} removido`);
      }

      const oldChecks = byId(old.checks ?? []);
      const newChecks = byId(after.checks ?? []);
      for (const check of after.checks ?? []) {
        const previous = oldChecks.get(check.id);
        if (!previous) push("added", "check", `${label}: CHECK (${check.expression}) criado`);
        else if (previous.expression !== check.expression || previous.name !== check.name) {
          push("changed", "check", `${label}: CHECK (${previous.expression}) → CHECK (${check.expression})`);
        }
      }
      for (const check of old.checks ?? []) {
        if (!newChecks.has(check.id)) push("removed", "check", `${label}: CHECK (${check.expression}) removido`);
      }
    } else if (node.type === "viewNode") {
      const after = node.data as ViewData;
      if (!before) {
        push("added", "view", `View ${after.name || "sem nome"} criada`);
        continue;
      }
      const old = before.data as ViewData;
      if ((old.name ?? "") !== (after.name ?? "")) {
        push("changed", "view", `View ${old.name || "sem nome"} renomeada para ${after.name || "sem nome"}`);
      }
      if ((old.sql ?? "").trim() !== (after.sql ?? "").trim()) {
        push("changed", "view", `View ${after.name || "sem nome"}: consulta alterada`);
      }
    }
  }

  for (const node of from.nodes) {
    if (toNodes.has(node.id)) continue;
    if (node.type === "entityNode") push("removed", "table", `Tabela ${tableName(node)} removida`);
    if (node.type === "viewNode") push("removed", "view", `View ${(node.data as ViewData).name || "sem nome"} removida`);
  }

  const annotationsBefore = from.nodes.filter((n) => ANNOTATION_TYPES.has(n.type ?? ""));
  const annotationsAfter = to.nodes.filter((n) => ANNOTATION_TYPES.has(n.type ?? ""));
  const annotationSignature = (nodes: CustomNode[]) =>
    JSON.stringify(nodes.map((n) => [n.id, n.data]).sort());
  if (annotationSignature(annotationsBefore) !== annotationSignature(annotationsAfter)) {
    push("changed", "annotation", "Notas, textos ou seções alterados");
  }

  const fromRelations = new Map(relationEdges(from.edges).map((e) => [relationKey(e), e]));
  const toRelations = new Map(relationEdges(to.edges).map((e) => [relationKey(e), e]));
  for (const [key, edge] of toRelations) {
    const previous = fromRelations.get(key);
    if (!previous) push("added", "relation", `Relacionamento ${relationText(edge, toNodes)} criado`);
    else if (actionsOf(from.edges, previous) !== actionsOf(to.edges, edge)) {
      push("changed", "relation", `Relacionamento ${relationText(edge, toNodes)}: ações ON DELETE/ON UPDATE alteradas`);
    }
  }
  for (const [key, edge] of fromRelations) {
    if (!toRelations.has(key)) push("removed", "relation", `Relacionamento ${relationText(edge, fromNodes)} removido`);
  }

  return changes;
}
