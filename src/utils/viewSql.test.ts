import { describe, expect, it } from "vitest";
import { analyzeViewSql } from "./viewSql";

describe("analyzeViewSql", () => {
  it("tabelas de FROM, JOIN e listas com vírgula, sem repetir", () => {
    expect(
      analyzeViewSql(`
        SELECT p.id, c.nome AS cliente, sum(i.total) total
        FROM pedido p
        INNER JOIN public.cliente AS c ON c.id = p.cliente_id
        LEFT JOIN item i ON i.pedido_id = p.id, produto pr, pedido
        GROUP BY p.id, c.nome
      `),
    ).toEqual({ tables: ["pedido", "cliente", "item", "produto"], columns: ["id", "cliente", "total"] });
  });

  it("ignora FROM dentro de funções e nomes de CTE, mas lê subconsultas", () => {
    const { tables } = analyzeViewSql(`
      WITH recentes AS (SELECT * FROM pedido WHERE criado_em > now()), ids (x) AS (SELECT 1)
      SELECT EXTRACT(YEAR FROM r.criado_em) AS ano, TRIM(BOTH ' ' FROM r.obs)
      FROM recentes r
      WHERE r.cliente_id IN (SELECT id FROM cliente)
    `);
    expect(tables).toEqual(["pedido", "cliente"]);
  });

  it("colunas: *, tabela.*, alias, DISTINCT ON e expressões sem alias", () => {
    expect(analyzeViewSql("SELECT DISTINCT ON (a) a.*, b, x + 1 FROM t").columns).toEqual([
      "a.*",
      "b",
      "x + 1",
    ]);
    expect(analyzeViewSql("SELECT * FROM t").columns).toEqual(["*"]);
  });

  it("texto vazio ou inválido não lança erro", () => {
    expect(analyzeViewSql("")).toEqual({ tables: [], columns: [] });
    expect(analyzeViewSql("((( FROM")).toEqual({ tables: [], columns: [] });
  });
});
