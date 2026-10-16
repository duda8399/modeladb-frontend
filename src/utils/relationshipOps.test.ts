import { describe, expect, it } from "vitest";
import { buildRelationshipOps } from "./relationshipOps";
import type { CollabNode } from "../stores/diagramCollabStore";

const node = (id: string, name: string, x: number, fields = 0): CollabNode =>
  ({
    id,
    type: "entityNode",
    position: { x, y: 0 },
    data: { name, fields: Array.from({ length: fields }, (_, i) => ({ id: `${id}-f${i}` })) },
  }) as unknown as CollabNode;

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe("buildRelationshipOps", () => {
  it("1:N cria a aresta e a FK opcional na tabela filha", () => {
    const ops = buildRelationshipOps(
      "1:N",
      { id: "c", node: node("c", "cliente", 0), handle: "r" },
      { id: "p", node: node("p", "pedido", 100, 2) },
      ids(),
    );

    expect(ops.map((op) => op.type)).toEqual(["ADD_EDGE", "ADD_FIELD"]);
    expect(ops[0].payload).toEqual(
      expect.objectContaining({
        source: "c",
        target: "p",
        sourceHandle: "r",
        label: "1:N",
        data: {
          relationType: "1:N",
          sourceNodeId: "c",
          targetNodeId: "p",
          fkFieldName: "fk_cliente_id",
          fkFieldId: ops[1].payload.id,
        },
      }),
    );
    expect(ops[1]).toEqual(
      expect.objectContaining({
        targetId: "p",
        payload: expect.objectContaining({ name: "fk_cliente_id", fk: true, pk: false, notNull: false, order: 2 }),
      }),
    );
  });

  it("N:N cria a tabela associativa entre as duas e duas arestas 1:N", () => {
    const ops = buildRelationshipOps(
      "N:N",
      { id: "a", node: node("a", "aluno", 0) },
      { id: "c", node: node("c", "curso", 200) },
      ids(),
    );

    expect(ops.map((op) => op.type)).toEqual(["ADD_NODE", "ADD_EDGE", "ADD_EDGE"]);
    const junction = ops[0].payload;
    expect(junction.data.name).toBe("aluno_curso");
    expect(junction.position).toEqual({ x: 100, y: 0 });
    expect(junction.data.fields.map((f: { name: string; pk: boolean }) => [f.name, f.pk])).toEqual([
      ["fk_aluno_id", true],
      ["fk_curso_id", true],
    ]);
    expect(ops[1].payload).toEqual(expect.objectContaining({ source: "a", target: junction.id }));
    expect(ops[2].payload).toEqual(expect.objectContaining({ source: junction.id, target: "c" }));
  });

  it("um segundo relacionamento entre as mesmas tabelas cria a FK com outro nome", () => {
    const pedido = node("p", "pedido", 100);
    pedido.data.fields = [
      { id: "p1", name: "id", pk: true },
      { id: "p2", name: "FK_Cliente_ID", fk: true },
    ] as unknown as typeof pedido.data.fields;
    const ops = buildRelationshipOps("1:N", { id: "c", node: node("c", "cliente", 0) }, { id: "p", node: pedido }, ids());

    expect(ops[1].payload.name).toBe("fk_cliente_id_2");
    expect(ops[0].payload.data.fkFieldName).toBe("fk_cliente_id_2");
  });

  it("N:N de uma tabela com ela mesma não repete o nome da FK", () => {
    const pessoa = node("a", "pessoa", 0);
    const ops = buildRelationshipOps("N:N", { id: "a", node: pessoa }, { id: "a", node: pessoa }, ids());

    expect(ops[0].payload.data.fields.map((f: { name: string }) => f.name)).toEqual(["fk_pessoa_id", "fk_pessoa_id_2"]);
  });

  it("N:N escolhe outro nome quando a tabela associativa já existe", () => {
    const aluno = node("a", "aluno", 0);
    const curso = node("c", "curso", 200);
    const ops = buildRelationshipOps("N:N", { id: "a", node: aluno }, { id: "c", node: curso }, ids(), [
      aluno,
      curso,
      node("j", "Aluno_Curso", 100),
    ]);

    expect(ops[0].payload.data.name).toBe("aluno_curso_2");
  });

  it("usa o id quando a tabela não tem nome", () => {
    const ops = buildRelationshipOps("1:1", { id: "x" }, { id: "y" }, ids());

    expect(ops[1].payload.name).toBe("fk_x_id");
  });
});
