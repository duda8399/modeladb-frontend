import type { Field } from "../types/diagramER";

type MaybeDeleted = { deleted?: boolean };

export const PK_REQUIRED_MESSAGE = "A entidade precisa de ao menos uma chave primária.";

export function defaultPkField(id: string = crypto.randomUUID()): Field {
  return { id, name: "id", type: "INT", pk: true, fk: false, notNull: true, unique: true, ai: true };
}

const live = <T extends MaybeDeleted>(fields: readonly T[] | undefined): T[] =>
  (fields ?? []).filter((field) => !field.deleted);

export function hasPrimaryKey(fields: readonly (Field & MaybeDeleted)[] | undefined): boolean {
  return live(fields).some((field) => field.pk);
}

export function isLastPrimaryKey(fields: readonly (Field & MaybeDeleted)[] | undefined, fieldId: string): boolean {
  const pks = live(fields).filter((field) => field.pk);
  return pks.length === 1 && pks[0].id === fieldId;
}

export type PkFix = "promoted" | "added" | null;

export function ensurePrimaryKey<T extends Field & MaybeDeleted & { order?: number }>(
  fields: readonly T[],
  newId: () => string = () => crypto.randomUUID(),
): { fields: T[]; fix: PkFix } {
  if (hasPrimaryKey(fields)) return { fields: [...fields], fix: null };

  const idField = live(fields).find((field) => (field.name ?? "").trim().toLowerCase() === "id");
  if (idField) {
    return {
      fields: fields.map((field) =>
        field === idField ? { ...field, pk: true, notNull: true, unique: true } : field,
      ),
      fix: "promoted",
    };
  }

  const usesOrder = fields.some((field) => typeof field.order === "number");
  const created = { ...defaultPkField(newId()), ...(usesOrder ? { order: 0 } : {}) } as T;
  const shifted = usesOrder
    ? fields.map((field) => ({ ...field, order: (field.order ?? 0) + 1 }))
    : [...fields];
  return { fields: [created, ...shifted], fix: "added" };
}

export function pkFixMessage(tableName: string, fix: PkFix): string | null {
  if (fix === "promoted") return `A tabela "${tableName}" não tinha chave primária; a coluna "id" virou a PK.`;
  if (fix === "added") return `A tabela "${tableName}" não tinha chave primária; foi criada a coluna "id" como PK.`;
  return null;
}
