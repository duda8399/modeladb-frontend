import fc from "fast-check";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSqlBlocks, generateSqlScript } from "./sqlExport";
import { col, lojaDiagram, pk, table } from "../test/erFixtures";
import { ALL_UI_TYPES, KEYABLE_TYPES, diagramArb } from "../test/erArbitraries";
import { startEngines, type Engines } from "../test/dockerEngines";
import type { CustomEdge, CustomNode } from "../types/diagramER";

/**
 * Item 2 — Exportação SQL executada em bancos REAIS (MySQL 8.4 e
 * PostgreSQL 16, via Docker). É a evidência mais forte de que o script
 * exportado funciona de verdade.
 *
 * Mais lenta e dependente de Docker, por isso só roda sob demanda:
 *   npm run test:sql-engines
 */

let engines: Engines;
let seq = 0;

const mysqlScript = (nodes: CustomNode[], edges: CustomEdge[] = []) =>
  generateSqlScript(nodes, edges, "mysql", `teste_${++seq}`).sql;

const postgresDdl = (nodes: CustomNode[], edges: CustomEdge[] = []) => {
  const { blocks, foreignKeyStatements } = generateSqlBlocks(nodes, edges, "postgres");
  return [...blocks.map((b) => b.sql), ...foreignKeyStatements].join("\n\n");
};

function expectOk(result: { ok: boolean; error?: string }) {
  expect(result.ok ? "ok" : result.error).toBe("ok");
}

describe.skipIf(!process.env.SQL_ENGINES)("exportação SQL em bancos reais", () => {
  beforeAll(() => {
    engines = startEngines();
  }, 180_000);

  afterAll(() => {
    engines?.stop();
  });

  describe("cada tipo oferecido na interface", () => {
    it.each(ALL_UI_TYPES)("PostgreSQL 16 aceita uma coluna %s", (type) => {
      expectOk(engines.runPostgres(postgresDdl([table("t", [pk(), col("c", type)])])));
    });

    it.each(ALL_UI_TYPES)("MySQL 8.4 aceita uma coluna %s", (type) => {
      expectOk(engines.runMySql(mysqlScript([table("t", [pk(), col("c", type)])])));
    });

    it.each(["ENUM", "SET"])("os dois bancos aceitam %s com lista de valores e descrições", (type) => {
      const nodes = [
        table("t", [
          pk(),
          col("c", type, { values: ["a", "b'c", "d\\e"], description: "valores d'ele" }),
        ]),
      ];
      (nodes[0].data as { description?: string }).description = "tabela \\ com 'aspas'";
      expectOk(engines.runMySql(mysqlScript(nodes)));
      expectOk(engines.runPostgres(postgresDdl(nodes)));
    });
  });

  /**
   * Matriz tipo × restrição × banco. Além de verificar o resultado, grava a
   * matriz em reports/sql-compatibility.md para uso no texto do TCC.
   */
  it("matriz de compatibilidade: tipo × (simples, UNIQUE, PK) × banco", () => {
    const variants = { simples: {}, UNIQUE: { unique: true }, PK: { pk: true } } as const;
    const failures: string[] = [];
    const rows: string[] = [];

    for (const type of ALL_UI_TYPES) {
      const cells: string[] = [];
      for (const [variant, flags] of Object.entries(variants)) {
        const nodes = [table("t", [col("c", type, flags)])];
        const my = engines.runMySql(mysqlScript(nodes));
        const pg = engines.runPostgres(postgresDdl(nodes));
        if (!my.ok) failures.push(`mysql ${variant} ${type}`);
        if (!pg.ok) failures.push(`postgres ${variant} ${type}`);
        cells.push(my.ok ? "✅" : "❌", pg.ok ? "✅" : "❌");
      }
      rows.push(`| ${type} | ${cells.join(" | ")} |`);
    }

    mkdirSync("reports", { recursive: true });
    writeFileSync(
      "reports/sql-compatibility.md",
      [
        "# Compatibilidade do SQL exportado",
        "",
        `Gerado por \`npm run test:sql-engines\` em ${new Date().toISOString()} (MySQL 8.4, PostgreSQL 16).`,
        "",
        "| Tipo | Simples MySQL | Simples PG | UNIQUE MySQL | UNIQUE PG | PK MySQL | PK PG |",
        "|---|---|---|---|---|---|---|",
        ...rows,
        "",
      ].join("\n"),
    );

    const notKeyableInMySql = ["TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB", "JSON", "GEOMETRY", "POINT"];
    const expected = [
      ...notKeyableInMySql.flatMap((t) => [`mysql UNIQUE ${t}`, `mysql PK ${t}`]),
      "postgres UNIQUE POINT",
      "postgres PK POINT",
    ];

    // Se esta asserção falhar, a matriz mudou: confira reports/sql-compatibility.md.
    expect(failures.sort()).toEqual(expected.sort());
  }, 300_000);

  describe("diagrama completo", () => {
    it("o script MySQL do diagrama de exemplo executa e as FKs funcionam", () => {
      const { nodes, edges } = lojaDiagram();
      const script = mysqlScript(nodes, edges);
      const db = `teste_${seq}`;

      expectOk(engines.runMySql(script));
      expectOk(
        engines.runMySql(
          `USE \`${db}\`;
           INSERT INTO cliente (nome, email) VALUES ('Ana', 'ana@x.com');
           INSERT INTO pedido (criado_em, fk_cliente_id) VALUES (NOW(), 1);`,
        ),
      );

      const violation = engines.runMySql(
        `USE \`${db}\`; INSERT INTO pedido (criado_em, fk_cliente_id) VALUES (NOW(), 999);`,
      );
      expect(violation.ok).toBe(false);
      expect(!violation.ok && violation.error).toMatch(/foreign key constraint fails/i);
    });

    it("o script PostgreSQL do diagrama de exemplo executa e as FKs funcionam", () => {
      const { nodes, edges } = lojaDiagram();
      const ddl = postgresDdl(nodes, edges);

      expectOk(
        engines.runPostgres(
          `${ddl}
           INSERT INTO cliente (nome, email) VALUES ('Ana', 'ana@x.com');
           INSERT INTO pedido (criado_em, fk_cliente_id) VALUES (now(), 1);`,
        ),
      );

      const violation = engines.runPostgres(
        `${ddl}
         INSERT INTO pedido (criado_em, fk_cliente_id) VALUES (now(), 999);`,
      );
      expect(!violation.ok && violation.error).toMatch(/violates foreign key constraint/i);
    });
  });

  describe("propriedade: diagramas aleatórios executam nos dois bancos", () => {
    it("PostgreSQL 16", () => {
      fc.assert(
        fc.property(diagramArb(ALL_UI_TYPES, KEYABLE_TYPES), ({ nodes, edges }) => {
          expectOk(engines.runPostgres(postgresDdl(nodes, edges)));
        }),
        { numRuns: 25 },
      );
    }, 300_000);

    it("MySQL 8.4", () => {
      fc.assert(
        fc.property(diagramArb(ALL_UI_TYPES, KEYABLE_TYPES), ({ nodes, edges }) => {
          expectOk(engines.runMySql(mysqlScript(nodes, edges)));
        }),
        { numRuns: 25 },
      );
    }, 300_000);
  });

  describe("limitações conhecidas", () => {
    // A interface permite marcar UNIQUE/PK em qualquer tipo, mas no MySQL
    // colunas TEXT/BLOB/JSON/espaciais não podem ser chave sem ajustes.
    it.fails("MySQL: UNIQUE numa coluna TEXT", () => {
      expectOk(engines.runMySql(mysqlScript([table("t", [pk(), col("c", "TEXT", { unique: true })])])));
    });

    it.fails("PostgreSQL: UNIQUE numa coluna POINT", () => {
      expectOk(engines.runPostgres(postgresDdl([table("t", [pk(), col("c", "POINT", { unique: true })])])));
    });

    it.fails("MySQL: AUTO_INCREMENT numa coluna que não é chave", () => {
      expectOk(engines.runMySql(mysqlScript([table("t", [col("id", "INT", { ai: true })])])));
    });

    it.fails("MySQL: AUTO_INCREMENT numa coluna VARCHAR", () => {
      expectOk(engines.runMySql(mysqlScript([table("t", [col("id", "VARCHAR", { ai: true, pk: true })])])));
    });
  });
});
