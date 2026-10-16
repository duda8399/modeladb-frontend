import { normalizeSqlName } from "./identifiers";

type NamedNode = {
  id: string;
  type?: string;
  deleted?: boolean;
  data?: { name?: unknown; deleted?: boolean } | Record<string, unknown>;
};

const NAMED_TYPES = new Set(["entityNode", "viewNode"]);

export const nameKey = (name: unknown): string =>
  typeof name === "string" ? normalizeSqlName(name.trim()) : "";

const isNamed = (node: NamedNode) =>
  NAMED_TYPES.has(node.type ?? "") && !node.deleted && !(node.data as { deleted?: boolean } | undefined)?.deleted;

const nameOf = (node: NamedNode) => (node.data as { name?: unknown } | undefined)?.name;

export function findNameConflict<T extends NamedNode>(
  nodes: readonly T[],
  name: string,
  exceptId?: string,
): T | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return nodes.find((node) => node.id !== exceptId && isNamed(node) && nameKey(nameOf(node)) === key);
}

export function nameError(nodes: readonly NamedNode[], name: string, exceptId?: string): string | null {
  if (!name.trim()) return "O nome não pode ficar vazio.";
  const conflict = findNameConflict(nodes, name, exceptId);
  if (!conflict) return null;
  const kind = conflict.type === "viewNode" ? "uma view" : "uma entidade";
  return `Já existe ${kind} chamada "${String(nameOf(conflict) ?? "").trim()}".`;
}

export function uniqueName(base: string, nodes: readonly NamedNode[], separator = "_"): string {
  const taken = new Set(nodes.filter(isNamed).map((node) => nameKey(nameOf(node))));
  const root = base.trim() || "Entidade";
  if (!taken.has(nameKey(root))) return root;
  let suffix = 2;
  while (taken.has(nameKey(`${root}${separator}${suffix}`))) suffix += 1;
  return `${root}${separator}${suffix}`;
}

let cachedNodes: readonly NamedNode[] | null = null;
let cachedIds: Set<string> = new Set();

export function duplicateNameIds(nodes: readonly NamedNode[]): Set<string> {
  if (nodes === cachedNodes) return cachedIds;
  const byKey = new Map<string, string[]>();
  for (const node of nodes) {
    if (!isNamed(node)) continue;
    const key = nameKey(nameOf(node));
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), node.id]);
  }
  const ids = new Set<string>();
  for (const group of byKey.values()) if (group.length > 1) group.forEach((id) => ids.add(id));
  cachedNodes = nodes;
  cachedIds = ids;
  return ids;
}

export function dedupeNodeNames<T extends NamedNode>(nodes: readonly T[]): { nodes: T[]; renamed: { from: string; to: string }[] } {
  const accepted: NamedNode[] = [];
  const renamed: { from: string; to: string }[] = [];
  const result = nodes.map((node) => {
    if (!isNamed(node)) return node;
    const current = String(nameOf(node) ?? "").trim();
    const fallback = node.type === "viewNode" ? "view" : "Entidade";
    const next = current && !findNameConflict(accepted, current) ? current : uniqueName(current || fallback, accepted);
    const updated = next === nameOf(node) ? node : ({ ...node, data: { ...node.data, name: next } } as T);
    if (current && next !== current) renamed.push({ from: current, to: next });
    accepted.push(updated);
    return updated;
  });
  return { nodes: result, renamed };
}

export function renameMessage({ from, to }: { from: string; to: string }): string {
  return `O nome "${from}" já estava em uso; o item foi renomeado para "${to}".`;
}
