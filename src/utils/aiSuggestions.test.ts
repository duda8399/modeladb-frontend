import { beforeEach, describe, expect, it } from "vitest";
import { createReplica, edge, entity, field, type Replica } from "../test/replica";
import { describeAction, planSuggestion, type SuggestionAction } from "./aiSuggestions";
import type { CollabNode } from "../stores/diagramCollabStore";

const action = (partial: Partial<SuggestionAction>): SuggestionAction => ({
  type: "set_column_type",
  table: "pedido",
  column: null,
  newName: null,
  dataType: null,
  size: null,
  flag: null,
  value: null,
  columns: null,
  expression: null,
  defaultValue: null,
  onDelete: null,
  onUpdate: null,
  ...partial,
});

function model() {
  const cliente = entity("c", "cliente");
  cliente.data.fields = [{ ...field("c1", "id"), pk: true, notNull: true, ai: true }, { ...field("c2", "email", 1), type: "VARCHAR" }];
  const pedido = entity("p", "pedido");
  pedido.data.fields = [
    { ...field("p1", "id"), pk: true },
    { ...field("p2", "cliente_id", 1), fk: true },
    { ...field("p3", "total", 2), type: "FLOAT" },
  ];
  const fk = edge("e", "c", "p");
  fk.data = { ...fk.data, fkFieldName: "cliente_id" };
  return { nodes: [cliente, pedido], edges: [fk] };
}

let ids = 0;
const newId = () => `novo-${++ids}`;

describe("planSuggestion aplicado no store colaborativo", () => {
  let r: Replica;

  beforeEach(async () => {
    r = await createReplica("alice");
    const { nodes, edges } = model();
    r.load(nodes, edges);
  });

  const apply = (a: SuggestionAction) => {
    const { nodes, edges } = r.state();
    const plan = planSuggestion(a, nodes, edges, newId);
    if ("error" in plan) throw new Error(plan.error);
    plan.ops.forEach((op) => r.local(op));
    return plan.ops;
  };
  const table = (id: string) => r.state().getNode(id) as CollabNode;
  const col = (tableId: string, name: string) => table(tableId).data.fields!.find((f) => f.name === name && !f.deleted);

  it("muda tipo e tamanho; desfazer volta ao original", () => {
    apply(action({ column: "total", dataType: "DECIMAL", size: "10,2" }));
    expect(col("p", "total")).toMatchObject({ type: "DECIMAL", size: "10,2" });

    r.undo();
    r.undo();
    expect(col("p", "total")).toMatchObject({ type: "FLOAT" });
    expect(col("p", "total")?.size).toBeUndefined();
  });

  it("renomear coluna FK atualiza a aresta para não quebrar o relacionamento", () => {
    const ops = apply(action({ type: "rename_column", column: "cliente_id", newName: "fk_cliente" }));
    expect(ops.map((op) => op.type)).toEqual(["SET_FIELD_PROP", "SET_EDGE_PROP"]);
    expect(col("p", "fk_cliente")).toBeTruthy();
    expect(r.state().getEdge("e")?.data?.fkFieldName).toBe("fk_cliente");
  });

  it("flags, DEFAULT, nova coluna, índice, CHECK, renomear tabela e ON DELETE", () => {
    apply(action({ type: "set_column_flag", table: "cliente", column: "email", flag: "unique", value: true }));
    apply(action({ type: "set_default", column: "total", defaultValue: "0" }));
    apply(action({ type: "add_column", column: "criado_em", dataType: "DATETIME", value: true }));
    apply(action({ type: "add_index", columns: ["cliente_id"] }));
    apply(action({ type: "add_check", expression: "total >= 0" }));
    apply(action({ type: "set_fk_action", column: "cliente_id", onDelete: "CASCADE", onUpdate: "NO ACTION" }));
    apply(action({ type: "rename_table", newName: "pedidos" }));

    expect(col("c", "email")?.unique).toBe(true);
    expect(col("p", "total")?.defaultValue).toBe("0");
    expect(col("p", "criado_em")).toMatchObject({ type: "DATETIME", notNull: true, order: 3 });
    expect(table("p").data.indexes).toEqual([
      { id: expect.any(String), name: "idx_pedido_cliente_id", columns: ["p2"], unique: false },
    ]);
    expect(table("p").data.checks).toEqual([{ id: expect.any(String), name: "chk_pedido_1", expression: "total >= 0" }]);
    expect(r.state().getEdge("e")?.data).toMatchObject({ onDelete: "CASCADE" });
    expect(r.state().getEdge("e")?.data?.onUpdate).toBeUndefined();
    expect(table("p").data.name).toBe("pedidos");
  });

  it("recusa ações que não cabem mais no diagrama atual", () => {
    const plan = (a: SuggestionAction) => {
      const { nodes, edges } = r.state();
      const result = planSuggestion(a, nodes, edges, newId);
      return "error" in result ? result.error : "ok";
    };

    expect(plan(action({ table: "produto", column: "x", dataType: "INT" }))).toContain("não existe mais");
    expect(plan(action({ column: "sumiu", dataType: "INT" }))).toContain("não existe mais");
    expect(plan(action({ column: "total", dataType: "INT", size: "10" }))).toContain("inválido");
    expect(plan(action({ column: "total", dataType: "FLOAT" }))).toBe("O diagrama já está assim.");
    expect(plan(action({ type: "rename_table", newName: "CLIENTE" }))).toContain("Já existe");
    expect(plan(action({ type: "add_column", column: "total", dataType: "INT" }))).toContain("já existe");
    expect(plan(action({ type: "add_column", column: " Total ", dataType: "INT" }))).toContain("já existe");
    expect(plan(action({ type: "rename_column", column: "total", newName: "CLIENTE ID" }))).toContain("Já existe");
    expect(plan(action({ type: "rename_column", column: "total", newName: "Total" }))).toBe("ok");
    expect(plan(action({ type: "set_fk_action", column: "total", onDelete: "CASCADE" }))).toContain("Não há relacionamento");
    expect(plan(action({ type: "set_default", table: "cliente", column: "id", defaultValue: "1" }))).toContain("auto incremento");

    apply(action({ type: "set_column_flag", column: "cliente_id", flag: "notNull", value: true }));
    expect(plan(action({ type: "set_fk_action", column: "cliente_id", onDelete: "SET NULL" }))).toContain("SET NULL");
  });
});

describe("describeAction", () => {
  it("frases curtas para o botão de aplicar", () => {
    expect(describeAction(action({ column: "total", dataType: "DECIMAL", size: "10,2" }))).toBe("Mudar pedido.total para DECIMAL(10,2)");
    expect(describeAction(action({ type: "add_index", columns: ["a", "b"], value: true }))).toBe("Criar índice único em pedido (a, b)");
    expect(describeAction(action({ type: "set_fk_action", column: "c", onDelete: "CASCADE" }))).toBe("ON DELETE CASCADE em pedido.c");
  });
});
