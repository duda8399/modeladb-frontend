import type { Field } from "../types/diagramER";
import type { CollabField, OperationDraft } from "../stores/diagramCollabStore";

const INTERNAL_KEYS = new Set(["id", "order", "deleted", "_crdt"]);

export function visibleFields(fields?: CollabField[]): CollabField[] {
  return (fields || [])
    .filter((f) => !f.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function diffFields(
  nodeId: string,
  storedFields: CollabField[] | undefined,
  newFields: Field[],
): OperationDraft[] {
  const ops: OperationDraft[] = [];
  const current = visibleFields(storedFields);
  const newIds = new Set(newFields.map((f) => f.id));
  const currentById = new Map(current.map((f) => [f.id, f]));

  current.forEach((f) => {
    if (!newIds.has(f.id)) {
      ops.push({ type: "REMOVE_FIELD", targetId: nodeId, payload: { fieldId: f.id } });
    }
  });

  newFields.forEach((f, index) => {
    const old = currentById.get(f.id);

    if (!old) {
      const { deleted: _deleted, _crdt, ...clean } = f as CollabField;
      void _deleted;
      void _crdt;
      ops.push({ type: "ADD_FIELD", targetId: nodeId, payload: { ...clean, order: index } });
      return;
    }

    (Object.keys(f) as (keyof Field)[]).forEach((key) => {
      if (INTERNAL_KEYS.has(key)) return;
      if (old[key] === f[key]) return;

      ops.push({
        type: "SET_FIELD_PROP",
        targetId: nodeId,
        payload: { fieldId: f.id, key, value: f[key] },
        previousValue: old[key],
      });
    });

  });

  const keptOld = current.filter((f) => newIds.has(f.id)).map((f) => f.id);
  const keptNew = newFields.filter((f) => currentById.has(f.id)).map((f) => f.id);
  const reordered = keptOld.some((id, i) => keptNew[i] !== id);

  if (reordered) {
    newFields.forEach((f, index) => {
      const old = currentById.get(f.id);
      if (!old) return;

      const oldOrder = old.order ?? current.indexOf(old);
      if (oldOrder === index) return;

      ops.push({
        type: "SET_FIELD_ORDER",
        targetId: nodeId,
        payload: { fieldId: f.id, order: index },
        previousValue: oldOrder,
      });
    });
  }

  return ops;
}
