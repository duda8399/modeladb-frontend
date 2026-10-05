import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateSqlBlocks, generateSqlScript } from "./sqlExport";
import { col, lojaDiagram, manyToMany, oneToMany, pk, table } from "../test/erFixtures";
import { ddlStatements, parseAll, runOnPgMem } from "../test/sqlEngines";
import { PG_MEM_TYPES, diagramArb } from "../test/erArbitraries";

/**
 * Item 2 — Exportação SQL.
 * Além de comparar o texto gerado, o SQL é executado num PostgreSQL emulado
 * (pg-mem) e analisado pela gramática do MySQL (node-sql-parser).
 */

describe("geração de CREATE TABLE", () => {
  const cliente = () =>
    table("cliente", [
      pk(),
      col("nome", "VARCHAR", { notNull: true }),
      col("email", "VARCHAR", { unique: true }),
    ]);

  it("MySQL: crases, VARCHAR(255), AUTO_INCREMENT e PRIMARY KEY", () => {
    const [block] = generateSqlBlocks([cliente()], [], "mysql").blocks;

    expect(block.sql).toBe(
      [
        "CREATE TABLE `cliente` (",
        "  `id` INT NOT NULL AUTO_INCREMENT,",
        "  `nome` VARCHAR(255) NOT NULL,",
        "  `email` VARCHAR(255) UNIQUE,",
        "  PRIMARY KEY (`id`)",
        ");",
      ].join("\n"),
    );
  });

  it("PostgreSQL: aspas duplas e SERIAL no lugar de AUTO_INCREMENT", () => {
    const [block] = generateSqlBlocks([cliente()], [], "postgres").blocks;

    expect(block.sql).toBe(
      [
        'CREATE TABLE "cliente" (',
        '  "id" SERIAL NOT NULL,',
        '  "nome" VARCHAR(255) NOT NULL,',
        '  "email" VARCHAR(255) UNIQUE,',
        '  PRIMARY KEY ("id")',
        ");",
      ].join("\n"),
    );
  });

  it("chave primária composta gera uma única cláusula PRIMARY KEY", () => {
    const t = table("item", [
      col("pedido_id", "INT", { pk: true }),
      col("produto_id", "INT", { pk: true }),
    ]);

    const [block] = generateSqlBlocks([t], [], "postgres").blocks;

    expect(block.sql).toContain('PRIMARY KEY ("pedido_id", "produto_id")');
    expect(block.sql.match(/PRIMARY KEY/g)).toHaveLength(1);
  });

  it("chave primária implica NOT NULL e não repete UNIQUE", () => {
    const t = table("t", [col("id", "INT", { pk: true, unique: true })]);

    const [block] = generateSqlBlocks([t], [], "mysql").blocks;

    expect(block.sql).toContain("`id` INT NOT NULL,");
    expect(block.sql).not.toContain("UNIQUE");
  });

  it.each([
    ["TINYINT", "SMALLINT"],
    ["MEDIUMINT", "INTEGER"],
    ["INT", "INTEGER"],
    ["FLOAT", "REAL"],
    ["DOUBLE", "DOUBLE PRECISION"],
    ["DATETIME", "TIMESTAMP"],
    ["YEAR", "SMALLINT"],
    ["CHAR", "CHAR(1)"],
    ["LONGTEXT", "TEXT"],
    ["ENUM", "TEXT"],
    ["SET", "TEXT"],
    ["BLOB", "BYTEA"],
    ["VARBINARY", "BYTEA"],
    ["JSON", "JSONB"],
    ["GEOMETRY", "TEXT"],
  ])("PostgreSQL converte o tipo MySQL %s em %s", (mysqlType, pgType) => {
    const [block] = generateSqlBlocks([table("t", [col("c", mysqlType)])], [], "postgres").blocks;

    expect(block.sql).toContain(`"c" ${pgType}`);
  });

  it.each([
    ["TINYINT", "SMALLSERIAL"],
    ["SMALLINT", "SMALLSERIAL"],
    ["INT", "SERIAL"],
    ["BIGINT", "BIGSERIAL"],
  ])("PostgreSQL usa %s auto-incremento como %s", (type, serial) => {
    const [block] = generateSqlBlocks([table("t", [col("id", type, { ai: true })])], [], "postgres").blocks;

    expect(block.sql).toContain(`"id" ${serial}`);
  });

  it("aceita tipos em minúsculas", () => {
    const [block] = generateSqlBlocks([table("t", [col("c", "varchar")])], [], "mysql").blocks;

    expect(block.sql).toContain("`c` VARCHAR(255)");
  });
});

describe("validação e saneamento", () => {
  it("ignora colunas sem nome ou sem tipo e informa quantas foram ignoradas", () => {
    const t = table("t", [pk(), col(null, "INT"), col("sem_tipo", null), col("", "INT")]);

    const result = generateSqlBlocks([t], [], "mysql");

    expect(result.skippedFields).toBe(3);
    expect(result.blocks[0].sql).not.toContain("sem_tipo");
  });

  it("não gera CREATE TABLE para entidades sem nenhuma coluna válida", () => {
    const result = generateSqlBlocks([table("vazia", [col(null, null)]), table("ok", [pk()])], [], "mysql");

    expect(result.blocks.map((b) => b.title)).toEqual(["ok"]);
  });

  it("ignora nós que não são entidades (notas, textos, seções)", () => {
    const { nodes, edges } = lojaDiagram();

    const titles = generateSqlBlocks(nodes, edges, "mysql").blocks.map((b) => b.title);

    expect(titles).not.toContain("nota");
    expect(titles).toHaveLength(4);
  });

  it("remove acentos e caracteres especiais dos identificadores", () => {
    const t = table("Pedido Ítem", [col("preço unitário", "DECIMAL"), col("descrição", "TEXT")]);

    const [block] = generateSqlBlocks([t], [], "postgres").blocks;

    expect(block.sql).toContain('CREATE TABLE "Pedido_Item"');
    expect(block.sql).toContain('"preco_unitario" DECIMAL');
    expect(block.sql).toContain('"descricao" TEXT');
  });

  it("neutraliza tentativas de injeção de SQL nos nomes", () => {
    const evil = "x`); DROP TABLE usuarios; --";
    const t = table(evil, [col(evil, "INT")]);

    const statements = ddlStatements([t], [], "mysql");

    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/DROP TABLE/);
    expect(() => parseAll([t], [], "mysql")).not.toThrow();
  });

  it("usa nome padrão para entidade sem nome", () => {
    const [block] = generateSqlBlocks([table("", [pk()])], [], "mysql").blocks;

    expect(block.title).toBe("tabela_sem_nome");
  });
});

describe("chaves estrangeiras", () => {
  it("1:N gera ALTER TABLE na tabela do lado N referenciando a PK do lado 1", () => {
    const cliente = table("cliente", [pk("codigo")]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(cliente, pedido);

    const { foreignKeyStatements } = generateSqlBlocks([cliente, pedido], [edge], "mysql");

    expect(foreignKeyStatements).toEqual([
      "ALTER TABLE `pedido` ADD CONSTRAINT `fk_pedido_fk_cliente_id` " +
        "FOREIGN KEY (`fk_cliente_id`) REFERENCES `cliente`(`codigo`);",
    ]);
  });

  it("referencia a coluna id quando a tabela de origem não tem PK", () => {
    const origem = table("origem", [col("nome", "TEXT")]);
    const destino = table("destino", [pk()]);
    const edge = oneToMany(origem, destino);

    const { foreignKeyStatements } = generateSqlBlocks([origem, destino], [edge], "postgres");

    expect(foreignKeyStatements[0]).toContain('REFERENCES "origem"("id")');
  });

  it("N:N gera exatamente duas FKs na tabela associativa, mesmo com duas arestas", () => {
    const aluno = table("aluno", [pk()]);
    const curso = table("curso", [pk()]);
    const { junction, edges } = manyToMany(aluno, curso);

    const { foreignKeyStatements } = generateSqlBlocks([aluno, curso, junction], edges, "postgres");

    expect(foreignKeyStatements).toEqual([
      'ALTER TABLE "aluno_curso" ADD CONSTRAINT "fk_aluno_curso_fk_aluno_id" FOREIGN KEY ("fk_aluno_id") REFERENCES "aluno"("id");',
      'ALTER TABLE "aluno_curso" ADD CONSTRAINT "fk_aluno_curso_fk_curso_id" FOREIGN KEY ("fk_curso_id") REFERENCES "curso"("id");',
    ]);
  });

  it("ignora arestas cujas tabelas não existem mais", () => {
    const a = table("a", [pk()]);
    const b = table("b", [pk()]);
    const edge = oneToMany(a, b);

    const { foreignKeyStatements } = generateSqlBlocks([b], [edge], "mysql");

    expect(foreignKeyStatements).toEqual([]);
  });

  it("as FKs vêm depois de todos os CREATE TABLE", () => {
    const { nodes, edges } = lojaDiagram();

    const { sql } = generateSqlScript(nodes, edges, "postgres");

    const lastCreate = sql.lastIndexOf("CREATE TABLE");
    const firstAlter = sql.indexOf("ALTER TABLE");
    expect(firstAlter).toBeGreaterThan(lastCreate);
  });
});

describe("script completo", () => {
  it("MySQL: cria e seleciona o banco e desliga a checagem de FK durante a carga", () => {
    const { nodes, edges } = lojaDiagram();

    const { sql } = generateSqlScript(nodes, edges, "mysql", "Minha Loja");

    expect(sql.startsWith("-- Gerado pelo ModelaDB\nCREATE DATABASE IF NOT EXISTS `Minha_Loja`;\nUSE `Minha_Loja`;")).toBe(true);
    expect(sql).toContain("SET FOREIGN_KEY_CHECKS=0;");
    expect(sql.trimEnd().endsWith("SET FOREIGN_KEY_CHECKS=1;")).toBe(true);
  });

  it("PostgreSQL: orienta a conexão ao banco antes do restante do script", () => {
    const { sql } = generateSqlScript([table("t", [pk()])], [], "postgres", "loja");

    expect(sql).toContain('CREATE DATABASE "loja";');
    expect(sql).toContain("\\c loja");
  });

  it("usa 'modeladb' como nome padrão do banco", () => {
    expect(generateSqlScript([], [], "mysql").sql).toContain("CREATE DATABASE IF NOT EXISTS `modeladb`;");
  });
});

describe("execução num PostgreSQL emulado (pg-mem)", () => {
  it("o script do diagrama de exemplo executa sem erros", () => {
    const { nodes, edges } = lojaDiagram();

    expect(() => runOnPgMem(nodes, edges)).not.toThrow();
  });

  it("as chaves estrangeiras geradas são de fato aplicadas pelo banco", () => {
    const { nodes, edges } = lojaDiagram();
    const db = runOnPgMem(nodes, edges);

    db.public.none(`INSERT INTO "cliente" ("nome", "email") VALUES ('Ana', 'ana@x.com')`);
    db.public.none(`INSERT INTO "pedido" ("criado_em", "fk_cliente_id") VALUES (now(), 1)`);
    db.public.none(`INSERT INTO "produto" ("preco", "ativo") VALUES (9.9, true)`);
    db.public.none(`INSERT INTO "pedido_produto" VALUES (1, 1)`);

    expect(() =>
      db.public.none(`INSERT INTO "pedido" ("criado_em", "fk_cliente_id") VALUES (now(), 999)`),
    ).toThrow(/foreign key/i);
    expect(() => db.public.none(`INSERT INTO "pedido_produto" VALUES (1, 1)`)).toThrow();
  });

  it("restrições UNIQUE e NOT NULL são aplicadas", () => {
    const { nodes, edges } = lojaDiagram();
    const db = runOnPgMem(nodes, edges);

    db.public.none(`INSERT INTO "cliente" ("nome", "email") VALUES ('Ana', 'a@x.com')`);
    expect(() => db.public.none(`INSERT INTO "cliente" ("nome", "email") VALUES ('Bia', 'a@x.com')`)).toThrow();
    expect(() => db.public.none(`INSERT INTO "cliente" ("email") VALUES ('c@x.com')`)).toThrow();
  });
});

describe("gramática do MySQL (node-sql-parser)", () => {
  it("todos os comandos do diagrama de exemplo são SQL MySQL válido", () => {
    const { nodes, edges } = lojaDiagram();

    expect(() => parseAll(nodes, edges, "mysql")).not.toThrow();
  });
});

describe("propriedade: qualquer diagrama com nomes distintos gera SQL válido", () => {
  it("o DDL PostgreSQL sempre executa no pg-mem", () => {
    fc.assert(
      fc.property(diagramArb(PG_MEM_TYPES), ({ nodes, edges }) => {
        runOnPgMem(nodes, edges);
      }),
      { numRuns: 200 },
    );
  });

  it("o DDL MySQL sempre é aceito pela gramática do MySQL (exceto ENUM/SET, ver abaixo)", () => {
    fc.assert(
      fc.property(diagramArb(PG_MEM_TYPES), ({ nodes, edges }) => {
        for (const n of nodes) {
          for (const f of (n.data as { fields: { type: string | null }[] }).fields) {
            if (f.type === "ENUM" || f.type === "SET") f.type = "TEXT";
          }
        }
        parseAll(nodes, edges, "mysql");
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Limitações conhecidas, documentadas com `it.fails`: o teste descreve o
 * comportamento desejado e hoje falha. Quando a limitação for resolvida, o
 * Vitest acusa e o `.fails` deve ser removido.
 */
describe("limitações conhecidas", () => {
  it.fails.each(["ENUM", "SET"])("MySQL: o tipo %s é exportado sem a lista de valores obrigatória", (type) => {
    parseAll([table("t", [pk(), col("c", type)])], [], "mysql");
  });

  it.fails("duas entidades com o mesmo nome geram um script que não executa", () => {
    runOnPgMem([table("Cliente", [pk()]), table("Cliente", [pk()])], []);
  });

  it.fails("renomear a coluna FK depois de criar o relacionamento quebra o ALTER TABLE", () => {
    const cliente = table("cliente", [pk()]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(cliente, pedido);
    const fields = (pedido.data as { fields: { name: string | null; fk: boolean }[] }).fields;
    fields.find((f) => f.fk)!.name = "cliente_id";

    runOnPgMem([cliente, pedido], [edge]);
  });
});
