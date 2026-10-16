import { nameKey } from "./entityNames";

type NamedField = { id: string; name?: string | null; deleted?: boolean };

const live = <T extends NamedField>(fields: readonly T[] | undefined): T[] =>
  (fields ?? []).filter((field) => !field.deleted);

export function findFieldConflict<T extends NamedField>(
  fields: readonly T[] | undefined,
  name: string | null | undefined,
  exceptId?: string,
): T | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  return live(fields).find((field) => field.id !== exceptId && nameKey(field.name) === key);
}

export function fieldNameError(
  fields: readonly NamedField[] | undefined,
  name: string | null | undefined,
  exceptId?: string,
): string | null {
  const conflict = findFieldConflict(fields, name, exceptId);
  return conflict ? `Já existe o atributo "${(conflict.name ?? "").trim()}" nesta entidade.` : null;
}

export function duplicateFieldIds(fields: readonly NamedField[] | undefined): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const field of live(fields)) {
    const key = nameKey(field.name);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), field.id]);
  }
  const ids = new Set<string>();
  for (const group of byKey.values()) if (group.length > 1) group.forEach((id) => ids.add(id));
  return ids;
}

function duplicatedKeys(fields: readonly NamedField[] | undefined): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const field of live(fields)) {
    const key = nameKey(field.name);
    if (!key) continue;
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return repeated;
}

export function introducesDuplicateFieldName(
  before: readonly NamedField[] | undefined,
  after: readonly NamedField[] | undefined,
): boolean {
  const old = duplicatedKeys(before);
  return [...duplicatedKeys(after)].some((key) => !old.has(key));
}

export function uniqueFieldName(base: string, fields: readonly NamedField[] | undefined): string {
  const taken = new Set(live(fields).map((field) => nameKey(field.name)));
  if (!taken.has(nameKey(base))) return base;
  let suffix = 2;
  while (taken.has(nameKey(`${base}_${suffix}`))) suffix += 1;
  return `${base}_${suffix}`;
}

export function dedupeFieldNames<T extends NamedField>(
  fields: readonly T[],
): { fields: T[]; renamed: { from: string; to: string }[] } {
  const accepted: NamedField[] = [];
  const renamed: { from: string; to: string }[] = [];
  const result = fields.map((field) => {
    if (field.deleted || !nameKey(field.name)) return field;
    const current = (field.name ?? "").trim();
    const next = findFieldConflict(accepted, current) ? uniqueFieldName(current, accepted) : field.name ?? "";
    const updated = next === field.name ? field : ({ ...field, name: next } as T);
    if (next !== field.name) renamed.push({ from: current, to: next });
    accepted.push(updated);
    return updated;
  });
  return { fields: result, renamed };
}

export function fieldRenameMessage(tableName: string, { from, to }: { from: string; to: string }): string {
  return `A tabela "${tableName}" tinha mais de um atributo "${from}"; um deles foi renomeado para "${to}".`;
}
