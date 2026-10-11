import { describe, expect, it } from "vitest";
import { diffDiagrams } from "./diagramDiff";
import { col, manyToMany, oneToMany, pk, table } from "../test/erFixtures";
import type { CustomNode, Field, TableCheck, TableIndex } from "../types/diagramER";

const clone = <T,>(value: T): T => structuredClone(value);
const fields = (node: CustomNode) => (node.data as { fields: Field[] }).fields;

function base() {
  const cliente = table("cliente", [pk(), col("nome", "VARCHAR", { size: "80" })], "cliente");
  const pedido = table("pedido", [pk()], "pedido");
  const fk = oneToMany(cliente, pedido);
  const view = { id: "v", type: "viewNode", position: { x: 0, y: 0 }, data: { name: "resumo", sql: "SELECT 1" } } as CustomNode;
  return { name: "Loja", nodes: [cliente, pedido, view], edges: [fk] };
}

describe("diffDiagrams", () => {
  it("diagramas iguais, ou só com posições diferentes, não têm mudanças", () => {
    const a = base();
    const b = clone(a);
    b.nodes[0].position = { x: 500, y: 300 };
    expect(diffDiagrams(a, b)).toEqual([]);
  });

  it("tabelas, colunas e propriedades de coluna", () => {
    const a = base();
    const b = clone(a);
    b.name = "Loja 2";
    (b.nodes[0].data as { name: string }).name = "clientes";
    const nome = fields(b.nodes[0])[1];
    nome.size = "120";
    nome.notNull = true;
    nome.defaultValue = "'x'";
    fields(b.nodes[0]).push(col("email", "VARCHAR", { unique: true }));
    fields(b.nodes[1]).splice(1, 1);
    b.nodes.push(table("produto", [pk()], "produto"));

    expect(diffDiagrams(a, b).map((c) => `${c.kind} ${c.scope}: ${c.text}`)).toEqual([
      "changed diagram: Nome do diagrama: Loja → Loja 2",
      "changed table: Tabela cliente renomeada para clientes",
      "changed column: clientes.nome: tipo VARCHAR(80) → VARCHAR(120), +NOT NULL, padrão nenhum → 'x'",
      "added column: clientes.email criada: VARCHAR UNIQUE",
      "removed column: pedido.fk_cliente_id removida",
      "added table: Tabela produto criada",
    ]);
  });

  it("índices, CHECK, views, anotações e relacionamentos", () => {
    const a = base();
    const b = clone(a);
    const cliente = b.nodes[0].data as { indexes?: TableIndex[]; checks?: TableCheck[] };
    cliente.indexes = [{ id: "i", name: "idx_nome", columns: [fields(b.nodes[0])[1].id], unique: true }];
    cliente.checks = [{ id: "c", name: "chk", expression: "id > 0" }];
    (b.nodes[2].data as { sql: string }).sql = "SELECT 2";
    b.nodes.push({ id: "n", type: "noteNode", position: { x: 0, y: 0 }, data: { text: "oi" } } as CustomNode);
    b.edges[0] = { ...b.edges[0], data: { ...b.edges[0].data!, onDelete: "CASCADE" } };

    const extra = table("produto", [pk()], "produto");
    const { junction, edges } = manyToMany(b.nodes[1], extra);
    b.nodes.push(extra, junction);
    b.edges.push(...edges);

    const texts = diffDiagrams(a, b).map((c) => `${c.kind} ${c.scope}: ${c.text}`);
    expect(texts).toEqual(
      expect.arrayContaining([
        "added index: cliente: índice único idx_nome (nome) criado",
        "added check: cliente: CHECK (id > 0) criado",
        "changed view: View resumo: consulta alterada",
        "changed annotation: Notas, textos ou seções alterados",
        "changed relation: Relacionamento cliente → pedido (1:N): ações ON DELETE/ON UPDATE alteradas",
        "added relation: Relacionamento pedido ↔ produto (N:N) criado",
      ]),
    );
    expect(texts.filter((t) => t.includes("(N:N)"))).toHaveLength(1);
  });

  it("remoções de view e relacionamento", () => {
    const a = base();
    const b = clone(a);
    b.nodes.splice(2, 1);
    b.edges = [];
    expect(diffDiagrams(a, b).map((c) => c.text)).toEqual([
      "View resumo removida",
      "Relacionamento cliente → pedido (1:N) removido",
    ]);
  });
});
