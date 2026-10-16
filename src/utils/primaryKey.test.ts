import { describe, expect, it } from "vitest";
import type { Field } from "../types/diagramER";
import { defaultPkField, ensurePrimaryKey, hasPrimaryKey, isLastPrimaryKey, pkFixMessage } from "./primaryKey";

const field = (id: string, extra: Partial<Field> & { deleted?: boolean; order?: number } = {}) => ({
  id,
  name: id,
  type: "INT",
  pk: false,
  fk: false,
  notNull: false,
  unique: false,
  ai: false,
  ...extra,
});

describe("primaryKey", () => {
  it("defaultPkField é um id INT auto incremento", () => {
    expect(defaultPkField("x")).toEqual({
      id: "x",
      name: "id",
      type: "INT",
      pk: true,
      fk: false,
      notNull: true,
      unique: true,
      ai: true,
    });
  });

  it("hasPrimaryKey ignora campos excluídos", () => {
    expect(hasPrimaryKey([field("a", { pk: true })])).toBe(true);
    expect(hasPrimaryKey([field("a", { pk: true, deleted: true })])).toBe(false);
    expect(hasPrimaryKey(undefined)).toBe(false);
  });

  it("isLastPrimaryKey só vale para a única PK viva", () => {
    const single = [field("a", { pk: true }), field("b")];
    expect(isLastPrimaryKey(single, "a")).toBe(true);
    expect(isLastPrimaryKey(single, "b")).toBe(false);
    const composite = [field("a", { pk: true }), field("b", { pk: true })];
    expect(isLastPrimaryKey(composite, "a")).toBe(false);
    const withTombstone = [field("a", { pk: true }), field("b", { pk: true, deleted: true })];
    expect(isLastPrimaryKey(withTombstone, "a")).toBe(true);
  });

  it("ensurePrimaryKey não altera quem já tem PK", () => {
    const fields = [field("a", { pk: true })];
    expect(ensurePrimaryKey(fields)).toEqual({ fields, fix: null });
  });

  it("ensurePrimaryKey promove a coluna id", () => {
    const { fields, fix } = ensurePrimaryKey([field("nome"), field("x", { name: "ID" })]);
    expect(fix).toBe("promoted");
    expect(fields[1]).toMatchObject({ pk: true, notNull: true, unique: true });
  });

  it("ensurePrimaryKey cria a coluna id no topo e desloca a ordem", () => {
    const { fields, fix } = ensurePrimaryKey([field("nome", { order: 0 })], () => "novo");
    expect(fix).toBe("added");
    expect(fields.map((f) => [f.id, f.name, f.pk, f.order])).toEqual([
      ["novo", "id", true, 0],
      ["nome", "nome", false, 1],
    ]);
  });

  it("pkFixMessage descreve a correção", () => {
    expect(pkFixMessage("t", null)).toBeNull();
    expect(pkFixMessage("t", "added")).toContain('"t"');
  });
});
