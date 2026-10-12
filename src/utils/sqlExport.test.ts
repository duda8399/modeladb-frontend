import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateSqlBlocks, generateSqlScript } from "./sqlExport";
import { col, lojaDiagram, manyToMany, oneToMany, pk, table } from "../test/erFixtures";
import { ddlStatements, parseAll, runOnPgMem } from "../test/sqlEngines";
import { PG_MEM_TYPES, diagramArb } from "../test/erArbitraries";
import type { CustomNode, Field, TableCheck, TableIndex } from "../types/diagramER";

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

  it("omite a FK quando a tabela de origem não tem PK, em vez de referenciar uma coluna inexistente", () => {
    const origem = table("origem", [col("nome", "TEXT")]);
    const destino = table("destino", [pk()]);
    const edge = oneToMany(origem, destino);

    const { foreignKeyStatements } = generateSqlBlocks([origem, destino], [edge], "postgres");

    expect(foreignKeyStatements).toEqual([]);
    expect(() => runOnPgMem([origem, destino], [edge])).not.toThrow();
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

describe("índices e views", () => {
  const comIndices = () => {
    const { nodes, edges, ids } = lojaDiagram();
    const cliente = nodes.find((n) => n.id === ids.cliente)!;
    const fields = (cliente.data as { fields: Field[] }).fields;
    const [, nome, email] = fields;
    (cliente.data as { indexes: TableIndex[] }).indexes = [
      { id: "i1", name: "idx_nome", columns: [nome.id], unique: false },
      { id: "i2", name: "", columns: [nome.id, email.id], unique: true },
      { id: "i3", name: "idx_orfao", columns: ["campo-removido"], unique: false },
    ];
    const view = {
      id: "v1",
      type: "viewNode",
      position: { x: 0, y: 0 },
      data: { name: "clientes ativos", sql: "  SELECT \"nome\" FROM \"cliente\";;  " },
    } as CustomNode;
    const vazia = { id: "v2", type: "viewNode", position: { x: 0, y: 0 }, data: { name: "x", sql: " " } } as CustomNode;
    return { nodes: [...nodes, view, vazia], edges };
  };

  it("MySQL: CREATE [UNIQUE] INDEX com nome padrão e sem colunas removidas", () => {
    const { nodes, edges } = comIndices();
    expect(generateSqlBlocks(nodes, edges, "mysql").indexStatements).toEqual([
      "CREATE INDEX `idx_nome` ON `cliente` (`nome`);",
      "CREATE UNIQUE INDEX `idx_cliente_nome_email` ON `cliente` (`nome`, `email`);",
    ]);
  });

  it("PostgreSQL: aspas duplas nos índices", () => {
    const { nodes, edges } = comIndices();
    expect(generateSqlBlocks(nodes, edges, "postgres").indexStatements[0]).toBe(
      'CREATE INDEX "idx_nome" ON "cliente" ("nome");',
    );
  });

  it("view: CREATE VIEW com nome saneado, sem ; duplicado; views vazias são contadas", () => {
    const { nodes, edges } = comIndices();
    const result = generateSqlBlocks(nodes, edges, "postgres");
    expect(result.viewBlocks.map((b) => b.sql)).toEqual([
      'CREATE VIEW "clientes_ativos" AS\nSELECT "nome" FROM "cliente";',
    ]);
    expect(result.skippedViews).toBe(1);
  });

  it("o script põe índices depois das FKs e views no fim", () => {
    const { nodes, edges } = comIndices();
    const { sql } = generateSqlScript(nodes, edges, "mysql");
    const posFk = sql.lastIndexOf("FOREIGN KEY");
    const posIndex = sql.indexOf("CREATE INDEX");
    const posView = sql.indexOf("CREATE VIEW");
    expect(posFk).toBeLessThan(posIndex);
    expect(posIndex).toBeLessThan(posView);
  });

  it("índices e view executam no pg-mem e o índice único é aplicado", () => {
    const { nodes, edges } = comIndices();
    const db = runOnPgMem(nodes, edges);
    db.public.none(`INSERT INTO "cliente" ("nome", "email") VALUES ('Ana', 'a@x.com')`);
    expect(db.public.many(`SELECT * FROM "clientes_ativos"`)).toEqual([{ nome: "Ana" }]);
  });

  it("índices são CREATE INDEX válidos na gramática do MySQL", () => {
    const { nodes, edges } = comIndices();
    expect(() => parseAll(nodes.filter((n) => n.type !== "viewNode"), edges, "mysql")).not.toThrow();
  });
});

describe("tamanho, DEFAULT, CHECK e ações de FK", () => {
  const loja = () => {
    const cliente = table("cliente", [
      pk(),
      col("nome", "VARCHAR", { notNull: true, size: "80" }),
      col("saldo", "DECIMAL", { size: "10,2", defaultValue: "0" }),
      col("status", "CHAR", { size: "1", defaultValue: "'A'" }),
      col("criado_em", "DATETIME", { size: "3", defaultValue: "CURRENT_TIMESTAMP" }),
      col("codigo", "VARCHAR", { size: "abc" }),
    ]);
    (cliente.data as { checks: TableCheck[] }).checks = [
      { id: "c1", name: "chk_saldo", expression: "saldo >= 0" },
      { id: "c2", name: "", expression: "status IN ('A', 'I')" },
      { id: "c3", name: "vazio", expression: "  " },
    ];
    const pedido = table("pedido", [pk()]);
    const fk = oneToMany(cliente, pedido);
    fk.data = { ...fk.data!, onDelete: "CASCADE", onUpdate: "RESTRICT" };
    return { nodes: [cliente, pedido], edges: [fk] };
  };

  it("MySQL: tamanho, DEFAULT e CHECK nomeado no CREATE TABLE", () => {
    const { nodes, edges } = loja();
    expect(generateSqlBlocks(nodes, edges, "mysql").blocks[0].sql).toBe(
      [
        "CREATE TABLE `cliente` (",
        "  `id` INT NOT NULL AUTO_INCREMENT,",
        "  `nome` VARCHAR(80) NOT NULL,",
        "  `saldo` DECIMAL(10,2) DEFAULT 0,",
        "  `status` CHAR(1) DEFAULT 'A',",
        "  `criado_em` DATETIME(3) DEFAULT CURRENT_TIMESTAMP,",
        "  `codigo` VARCHAR(255),",
        "  PRIMARY KEY (`id`),",
        "  CONSTRAINT `chk_saldo` CHECK (saldo >= 0),",
        "  CONSTRAINT `chk_cliente_2` CHECK (status IN ('A', 'I'))",
        ");",
      ].join("\n"),
    );
  });

  it("PostgreSQL: DATETIME(3) vira TIMESTAMP(3) e DECIMAL mantém a precisão", () => {
    const { nodes, edges } = loja();
    const sql = generateSqlBlocks(nodes, edges, "postgres").blocks[0].sql;
    expect(sql).toContain('"saldo" DECIMAL(10,2) DEFAULT 0');
    expect(sql).toContain('"criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP');
    expect(sql).toContain('"nome" VARCHAR(80) NOT NULL');
  });

  it("ON DELETE e ON UPDATE vão para a FK", () => {
    const { nodes, edges } = loja();
    expect(generateSqlBlocks(nodes, edges, "mysql").foreignKeyStatements).toEqual([
      "ALTER TABLE `pedido` ADD CONSTRAINT `fk_pedido_fk_cliente_id` FOREIGN KEY (`fk_cliente_id`) " +
        "REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;",
    ]);
  });

  it("ações das FKs da tabela associativa vêm da aresta de cada lado", () => {
    const a = table("a", [pk()]);
    const b = table("b", [pk()]);
    const { junction, edges } = manyToMany(a, b);
    edges[0].data = { ...edges[0].data!, onDelete: "CASCADE" };
    edges[1].data = { ...edges[1].data!, onDelete: "RESTRICT" };
    expect(generateSqlBlocks([a, b, junction], edges, "postgres").foreignKeyStatements).toEqual([
      expect.stringMatching(/\("fk_a_id"\) REFERENCES "a"\("id"\) ON DELETE CASCADE;$/),
      expect.stringMatching(/\("fk_b_id"\) REFERENCES "b"\("id"\) ON DELETE RESTRICT;$/),
    ]);
  });

  it("no pg-mem, DEFAULT preenche, CHECK barra e ON DELETE CASCADE apaga em cascata", () => {
    const { nodes, edges } = loja();
    const saldo = (nodes[0].data as { fields: Field[] }).fields.find((f) => f.name === "saldo")!;
    saldo.size = null;
    const db = runOnPgMem(nodes, edges);

    db.public.none(`INSERT INTO "cliente" ("nome") VALUES ('Ana')`);
    expect(db.public.one(`SELECT "saldo", "status" FROM "cliente"`)).toEqual({ saldo: 0, status: "A" });
    expect(() => db.public.none(`INSERT INTO "cliente" ("nome", "saldo") VALUES ('Bia', -5)`)).toThrow();

    db.public.none(`INSERT INTO "pedido" ("fk_cliente_id") VALUES (1)`);
    db.public.none(`DELETE FROM "cliente" WHERE "id" = 1`);
    expect(db.public.many(`SELECT * FROM "pedido"`)).toEqual([]);
  });

  it("o DDL MySQL com tamanho, DEFAULT, CHECK e ações é aceito pela gramática do MySQL", () => {
    const { nodes, edges } = loja();
    expect(() => parseAll(nodes, edges, "mysql")).not.toThrow();
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

  it("o DDL MySQL sempre é aceito pela gramática do MySQL", () => {
    fc.assert(
      fc.property(diagramArb(PG_MEM_TYPES), ({ nodes, edges }) => {
        parseAll(nodes, edges, "mysql");
      }),
      { numRuns: 200 },
    );
  });
});

describe("defeitos corrigidos (antes registrados como limitações)", () => {
  it.each(["ENUM", "SET"])("MySQL: %s sem valores cai para VARCHAR e o script continua válido", (type) => {
    const nodes = [table("t", [pk(), col("c", type)])];
    expect(generateSqlScript(nodes, [], "mysql").sql).toContain("`c` VARCHAR(255)");
    parseAll(nodes, [], "mysql");
  });

  it("duas entidades com o mesmo nome geram tabelas com nomes distintos", () => {
    const a = table("Cliente", [pk()]);
    const b = table("cliente", [pk()]);
    const { blocks } = generateSqlBlocks([a, b], [], "postgres");

    expect(blocks.map((block) => block.title)).toEqual(["Cliente", "cliente_2"]);
    expect(() => runOnPgMem([a, b], [])).not.toThrow();
  });

  it("a FK aponta para a tabela certa quando há nomes repetidos", () => {
    const primeiro = table("Cliente", [pk()]);
    const segundo = table("Cliente", [pk()]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(segundo, pedido);

    const { foreignKeyStatements } = generateSqlBlocks([primeiro, segundo, pedido], [edge], "postgres");

    expect(foreignKeyStatements).toEqual([
      'ALTER TABLE "pedido" ADD CONSTRAINT "fk_pedido_fk_Cliente_id" FOREIGN KEY ("fk_Cliente_id") REFERENCES "Cliente_2"("id");',
    ]);
    expect(() => runOnPgMem([primeiro, segundo, pedido], [edge])).not.toThrow();
  });

  it("colunas repetidas na mesma tabela recebem sufixo", () => {
    const t = table("t", [pk(), col("nome", "TEXT"), col("Nome", "TEXT")]);
    expect(generateSqlBlocks([t], [], "postgres").blocks[0].sql).toContain('"Nome_2" TEXT');
    expect(() => runOnPgMem([t], [])).not.toThrow();
  });

  it("renomear a coluna FK depois de criar o relacionamento mantém o ALTER TABLE válido", () => {
    const cliente = table("cliente", [pk()]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(cliente, pedido);
    const fields = (pedido.data as { fields: { name: string | null; fk: boolean }[] }).fields;
    fields.find((f) => f.fk)!.name = "cliente_id";

    const { foreignKeyStatements } = generateSqlBlocks([cliente, pedido], [edge], "postgres");
    expect(foreignKeyStatements[0]).toContain('FOREIGN KEY ("cliente_id")');
    runOnPgMem([cliente, pedido], [edge]);
  });

  it("a coluna FK é encontrada pelo id mesmo quando outra coluna ficou com o nome antigo", () => {
    const cliente = table("cliente", [pk()]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(cliente, pedido);
    const fields = (pedido.data as { fields: Field[] }).fields;
    const fkField = fields.find((f) => f.fk)!;
    edge.data!.fkFieldId = fkField.id;
    fkField.name = "comprador_id";
    fields.push(col("fk_cliente_id", "INT"));

    const { foreignKeyStatements } = generateSqlBlocks([cliente, pedido], [edge], "postgres");
    expect(foreignKeyStatements[0]).toContain('FOREIGN KEY ("comprador_id")');
  });

  it("não emite ALTER TABLE quando a coluna FK foi apagada", () => {
    const cliente = table("cliente", [pk()]);
    const pedido = table("pedido", [pk()]);
    const edge = oneToMany(cliente, pedido);
    const data = pedido.data as { fields: Field[] };
    data.fields = data.fields.filter((f) => !f.fk);

    expect(generateSqlBlocks([cliente, pedido], [edge], "postgres").foreignKeyStatements).toEqual([]);
    expect(() => runOnPgMem([cliente, pedido], [edge])).not.toThrow();
  });
});

describe("ENUM e SET com lista de valores", () => {
  const status = () =>
    table("pedido", [
      pk(),
      col("status", "ENUM", { values: ["aberto", "pago", "d'Ávila", " pago ", ""], notNull: true }),
      col("tags", "SET", { values: ["a", "b"] }),
    ]);

  it("MySQL recebe a lista de valores escapada e sem duplicatas", () => {
    const sql = generateSqlBlocks([status()], [], "mysql").blocks[0].sql;
    expect(sql).toContain("`status` ENUM('aberto', 'pago', 'd''Ávila') NOT NULL");
    expect(sql).toContain("`tags` SET('a', 'b')");
    parseAll([status()], [], "mysql");
  });

  it("PostgreSQL usa TEXT com CHECK para ENUM e o banco recusa valores fora da lista", () => {
    const sql = generateSqlBlocks([status()], [], "postgres").blocks[0].sql;
    expect(sql).toContain(`"status" TEXT NOT NULL CHECK ("status" IN ('aberto', 'pago', 'd''Ávila'))`);
    expect(sql).toContain('"tags" TEXT');

    const db = runOnPgMem([status()], []);
    db.public.none(`INSERT INTO "pedido" ("status") VALUES ('pago')`);
    expect(() => db.public.none(`INSERT INTO "pedido" ("status") VALUES ('cancelado')`)).toThrow();
  });

  it("descarta valores que o MySQL considera iguais e tira vírgulas de SET", () => {
    const t = table("t", [
      pk(),
      col("e", "ENUM", { values: ["a,b", "Ação", "acao", "ç", "c"] }),
      col("s", "SET", { values: ["a,b", "ab", ","] }),
    ]);
    const sql = generateSqlBlocks([t], [], "mysql").blocks[0].sql;
    expect(sql).toContain("`e` ENUM('a,b', 'Ação', 'ç')");
    expect(sql).toContain("`s` SET('ab')");
  });

  it("MySQL escapa barra invertida nos valores", () => {
    const t = table("t", [pk(), col("c", "ENUM", { values: ["a\\b"] })]);
    expect(generateSqlBlocks([t], [], "mysql").blocks[0].sql).toContain("ENUM('a\\\\b')");
  });
});

describe("descrições exportadas como COMMENT", () => {
  const documentado = () => {
    const t = table("cliente", [
      pk(),
      col("nome", "VARCHAR", { description: "Nome completo do cliente" }),
      col("apelido", "TEXT", { description: "   " }),
    ]);
    (t.data as { description?: string }).description = "Pessoas que compram na loja d'Ávila";
    return t;
  };

  it("MySQL usa COMMENT na coluna e COMMENT= na tabela", () => {
    const sql = generateSqlBlocks([documentado()], [], "mysql").blocks[0].sql;
    expect(sql).toContain("`nome` VARCHAR(255) COMMENT 'Nome completo do cliente'");
    expect(sql).toContain(") COMMENT='Pessoas que compram na loja d''Ávila';");
    expect(sql).not.toContain("`apelido` TEXT COMMENT");
    parseAll([documentado()], [], "mysql");
  });

  it("PostgreSQL usa COMMENT ON TABLE e COMMENT ON COLUMN", () => {
    const sql = generateSqlBlocks([documentado()], [], "postgres").blocks[0].sql;
    expect(sql).toContain(`COMMENT ON TABLE "cliente" IS 'Pessoas que compram na loja d''Ávila';`);
    expect(sql).toContain(`COMMENT ON COLUMN "cliente"."nome" IS 'Nome completo do cliente';`);
    expect(sql).not.toContain('"apelido" IS');
    expect(() => runOnPgMem([documentado()], [])).not.toThrow();
  });
});
