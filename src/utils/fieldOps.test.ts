import { describe, expect, it } from "vitest";
import { diffFields, visibleFields } from "./fieldOps";
import type { CollabField } from "../stores/diagramCollabStore";

const field = (id: string, order: number, extra: Partial<CollabField> = {}): CollabField => ({
  id,
  name: id,
  type: "INT",
  pk: false,
  fk: false,
  notNull: false,
  unique: false,
  ai: false,
  order,
  ...extra,
});

describe("diffFields", () => {
  it("não reenvia a remoção de campos já apagados", () => {
    const stored = [field("a", 0), field("apagado", 1, { deleted: true }), field("b", 2)];
    const rendered = visibleFields(stored);

    const ops = diffFields("n1", stored, rendered.map((f) => (f.id === "a" ? { ...f, name: "novo" } : f)));

    expect(ops).toEqual([
      {
        type: "SET_FIELD_PROP",
        targetId: "n1",
        payload: { fieldId: "a", key: "name", value: "novo" },
        previousValue: "a",
      },
    ]);
  });

  it("remove apenas o campo que saiu da lista", () => {
    const stored = [field("a", 0), field("apagado", 1, { deleted: true }), field("b", 2)];

    const ops = diffFields("n1", stored, [stored[0]]);

    expect(ops.filter((op) => op.type === "REMOVE_FIELD")).toEqual([
      { type: "REMOVE_FIELD", targetId: "n1", payload: { fieldId: "b" } },
    ]);
  });

  it("não gera operações quando nada mudou", () => {
    const stored = [field("a", 0), field("x", 1, { deleted: true }), field("b", 2)];

    expect(diffFields("n1", stored, visibleFields(stored))).toEqual([]);
  });

  it("ignora metadados internos desatualizados vindos do modal", () => {
    const stored = [field("a", 0, { _crdt: { name: { lamport: 9, userId: "u2" } } })];
    const staleCopy = { ...stored[0], _crdt: { name: { lamport: 1, userId: "u1" } } };

    expect(diffFields("n1", stored, [staleCopy])).toEqual([]);
  });

  it("adiciona campos novos na posição em que aparecem", () => {
    const stored = [field("a", 0)];
    const novo = field("c", 99);

    const ops = diffFields("n1", stored, [stored[0], novo]);

    expect(ops).toEqual([
      { type: "ADD_FIELD", targetId: "n1", payload: { ...novo, order: 1 } },
    ]);
  });

  it("reordena considerando só os campos visíveis", () => {
    const stored = [field("a", 0), field("x", 1, { deleted: true }), field("b", 2)];
    const [a, b] = visibleFields(stored);

    const ops = diffFields("n1", stored, [b, a]);

    expect(ops).toEqual([
      { type: "SET_FIELD_ORDER", targetId: "n1", payload: { fieldId: "b", order: 0 }, previousValue: 2 },
      { type: "SET_FIELD_ORDER", targetId: "n1", payload: { fieldId: "a", order: 1 }, previousValue: 0 },
    ]);
  });

  it("ao reordenar, normaliza a ordem de todos os campos para não embaralhar", () => {
    const stored = [field("a", 0), field("b", 10), field("c", 11)];
    const [a, b, c] = visibleFields(stored);

    const ops = diffFields("n1", stored, [c, b, a]);
    const orders = new Map(stored.map((f) => [f.id, f.order]));
    ops.forEach((op) => orders.set(op.payload.fieldId, op.payload.order));

    expect([...orders.entries()].sort((x, y) => x[1]! - y[1]!).map(([id]) => id)).toEqual(["c", "b", "a"]);
  });
});
