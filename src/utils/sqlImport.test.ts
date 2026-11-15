import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSqlToDiagram, SqlImportError } from "./sqlImport";
import { generateSqlBlocks, type SqlDialect } from "./sqlExport";
import { isValidSize } from "./sqlTypes";
import { ALL_UI_TYPES, diagramArb } from "../test/erArbitraries";
import type { CustomNode, Field, FkAction, TableCheck, TableIndex } from "../types/diagramER";

const tableByName = (nodes: CustomNode[], name: string) => {
  const node = nodes.find((n) => (n.data as { name: string }).name === name);
  if (!node) throw new Error(`tabela ${name} não encontrada`);
  return node;
};

const fieldsOf = (node: CustomNode) => (node.data as { fields: Field[] }).fields;

const field = (nodes: CustomNode[], table: string, column: string) => {
  const f = fieldsOf(tableByName(nodes, table)).find((x) => x.name === column);
  if (!f) throw new Error(`coluna ${table}.${column} não encontrada`);
  return f;
};

const flags = (f: Field) => ({ type: f.type, pk: f.pk, fk: f.fk, notNull: f.notNull, unique: f.unique, ai: f.ai });

describe("MySQL", () => {
  const sql = `
    -- Loja
    CREATE DATABASE IF NOT EXISTS loja;
    USE loja;
    SET FOREIGN_KEY_CHECKS=0;

    /* clientes */
    CREATE TABLE IF NOT EXISTS \`cliente\` (
      \`id\` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
      \`nome\` VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      \`email\` VARCHAR(255) UNIQUE,
      \`status\` ENUM('ativo','inativo; bloqueado') DEFAULT 'ativo',
      \`criado_em\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_nome\` (\`nome\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='tabela; de clientes';

    CREATE TABLE pedido (
      id INT PRIMARY KEY AUTO_INCREMENT,
      cliente_id INT NOT NULL,
      total DECIMAL(10,2) CHECK (total >= 0),
      CONSTRAINT fk_pedido_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id) ON DELETE CASCADE
    );

    INSERT INTO cliente (nome) VALUES ('Ana; Maria');
  `;

  it("cria uma entidade por CREATE TABLE com colunas, tipos e restrições", () => {
    const { nodes, tableCount } = parseSqlToDiagram(sql);

    expect(tableCount).toBe(2);
    expect(nodes.every((n) => n.type === "entityNode")).toBe(true);
    expect(fieldsOf(tableByName(nodes, "cliente")).map((f) => f.name)).toEqual([
      "id", "nome", "email", "status", "criado_em",
    ]);

    expect(flags(field(nodes, "cliente", "id"))).toEqual({
      type: "INT", pk: true, fk: false, notNull: true, unique: false, ai: true,
    });
    expect(flags(field(nodes, "cliente", "nome"))).toMatchObject({ type: "VARCHAR", notNull: true });
    expect(flags(field(nodes, "cliente", "email"))).toMatchObject({ type: "VARCHAR", unique: true, notNull: false });
    expect(field(nodes, "cliente", "status").type).toBe("ENUM");
    expect(field(nodes, "cliente", "criado_em").type).toBe("DATETIME");
    expect(flags(field(nodes, "pedido", "id"))).toMatchObject({ pk: true, ai: true, notNull: true });
    expect(field(nodes, "pedido", "total").type).toBe("DECIMAL");
  });

  it("gera a aresta 1:N com a coluna FK marcada, no formato do Constructor", () => {
    const { nodes, edges, relationCount } = parseSqlToDiagram(sql);
    const cliente = tableByName(nodes, "cliente");
    const pedido = tableByName(nodes, "pedido");

    expect(relationCount).toBe(1);
    expect(edges).toEqual([
      {
        id: expect.any(String),
        source: cliente.id,
        target: pedido.id,
        label: "1:N",
        type: "floating",
        data: {
          relationType: "1:N",
          sourceNodeId: cliente.id,
          targetNodeId: pedido.id,
          fkFieldName: "cliente_id",
          fkFieldId: field(nodes, "pedido", "cliente_id").id,
          onDelete: "CASCADE",
        },
      },
    ]);
    expect(field(nodes, "pedido", "cliente_id").fk).toBe(true);
  });

  it("dá ids únicos e a ordem de cada campo", () => {
    const { nodes } = parseSqlToDiagram(sql);
    const ids = [...nodes.map((n) => n.id), ...nodes.flatMap((n) => fieldsOf(n).map((f) => f.id))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(fieldsOf(nodes[0]).map((f) => (f as Field & { order: number }).order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("PostgreSQL", () => {
  it("SERIAL vira auto incremento e tipos do Postgres viram os do editor", () => {
    const { nodes, edges } = parseSqlToDiagram(`
      CREATE TABLE "public"."autor" (
        "id" BIGSERIAL PRIMARY KEY,
        "nome" CHARACTER VARYING(100) NOT NULL,
        "bio" TEXT,
        "ativo" BOOL DEFAULT true,
        "nota" DOUBLE PRECISION,
        "peso" REAL,
        "valor" NUMERIC(12, 2),
        "foto" BYTEA,
        "meta" JSONB,
        "tags" TEXT[],
        "criado_em" TIMESTAMP(3) WITH TIME ZONE DEFAULT now()
      );
      CREATE TABLE livro (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        autor_id INTEGER NOT NULL REFERENCES public.autor(id),
        isbn CHAR(13) UNIQUE
      );
    `);

    const types = Object.fromEntries(fieldsOf(tableByName(nodes, "autor")).map((f) => [f.name, f.type]));
    expect(types).toEqual({
      id: "BIGINT", nome: "VARCHAR", bio: "TEXT", ativo: "BOOLEAN", nota: "DOUBLE", peso: "FLOAT",
      valor: "DECIMAL", foto: "BLOB", meta: "JSON", tags: "JSON", criado_em: "TIMESTAMP",
    });
    expect(field(nodes, "autor", "id")).toMatchObject({ pk: true, ai: true });
    expect(field(nodes, "livro", "id")).toMatchObject({ type: "INT", pk: true, ai: true });
    expect(field(nodes, "livro", "autor_id")).toMatchObject({ fk: true, notNull: true });
    expect(field(nodes, "livro", "isbn")).toMatchObject({ type: "CHAR", unique: true });
    expect(edges).toHaveLength(1);
    expect(edges[0].data).toMatchObject({ relationType: "1:N", fkFieldName: "autor_id" });
  });

  it("GENERATED ... AS IDENTITY vira auto incremento sem valor padrão; coluna computada não", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE t (
        "id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
        "seq" INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 10 INCREMENT BY 5) UNIQUE,
        "total" INTEGER GENERATED ALWAYS AS (seq * 2) STORED,
        "x" INTEGER DEFAULT 5,
        PRIMARY KEY ("id")
      );
    `);

    expect(field(nodes, "t", "id")).toMatchObject({ type: "BIGINT", ai: true, notNull: true, pk: true });
    expect(field(nodes, "t", "id").defaultValue ?? null).toBeNull();
    expect(field(nodes, "t", "seq")).toMatchObject({ type: "INT", ai: true, unique: true });
    expect(field(nodes, "t", "total")).toMatchObject({ type: "INT", ai: false });
    expect(field(nodes, "t", "total").defaultValue ?? null).toBeNull();
    expect(field(nodes, "t", "x")).toMatchObject({ defaultValue: "5", ai: false });
  });

  it("entende o formato do pg_dump (chaves e sequências em ALTER TABLE)", () => {
    const { nodes, edges, warnings } = parseSqlToDiagram(`
      SET statement_timeout = 0;
      SELECT pg_catalog.set_config('search_path', '', false);

      CREATE FUNCTION public.touch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$;

      CREATE TABLE public.users (
          id integer NOT NULL,
          email character varying(255) NOT NULL,
          updated_at timestamp without time zone
      );
      ALTER TABLE public.users OWNER TO postgres;

      CREATE SEQUENCE public.users_id_seq AS integer START WITH 1 INCREMENT BY 1;
      ALTER TABLE public.users_id_seq OWNER TO postgres;
      ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

      CREATE TABLE public.posts (
          id integer NOT NULL,
          user_id integer
      );

      ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
      ALTER TABLE public.posts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.posts_id_seq);
      ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
      ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
      CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
      ALTER TABLE ONLY public.posts
          ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    `);

    expect(nodes.map((n) => (n.data as { name: string }).name)).toEqual(["users", "posts"]);
    expect(flags(field(nodes, "users", "id"))).toEqual({
      type: "INT", pk: true, fk: false, notNull: true, unique: false, ai: true,
    });
    expect(field(nodes, "users", "email")).toMatchObject({ unique: false, notNull: true });
    expect((tableByName(nodes, "users").data as { indexes: TableIndex[] }).indexes).toEqual([
      { id: expect.any(String), name: "users_email_key", columns: [field(nodes, "users", "email").id], unique: true },
    ]);
    expect(field(nodes, "users", "updated_at").type).toBe("TIMESTAMP");
    expect(field(nodes, "posts", "id")).toMatchObject({ pk: true, ai: true });
    expect(field(nodes, "posts", "user_id").fk).toBe(true);
    expect(edges).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});

describe("dump do phpMyAdmin", () => {
  it("aplica PRIMARY KEY, UNIQUE, AUTO_INCREMENT e FKs definidos depois do CREATE", () => {
    const { nodes, edges } = parseSqlToDiagram(`
      CREATE TABLE \`categoria\` (
        \`id\` int(11) NOT NULL,
        \`slug\` varchar(50) NOT NULL
      ) ENGINE=InnoDB;
      CREATE TABLE \`produto\` (
        \`id\` int(11) NOT NULL,
        \`categoria_id\` int(11) DEFAULT NULL
      ) ENGINE=InnoDB;
      ALTER TABLE \`categoria\`
        ADD PRIMARY KEY (\`id\`),
        ADD UNIQUE KEY \`slug\` (\`slug\`);
      ALTER TABLE \`produto\`
        ADD PRIMARY KEY (\`id\`),
        ADD KEY \`categoria_id\` (\`categoria_id\`);
      ALTER TABLE \`categoria\`
        MODIFY \`id\` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;
      ALTER TABLE \`produto\`
        ADD CONSTRAINT \`produto_ibfk_1\` FOREIGN KEY (\`categoria_id\`) REFERENCES \`categoria\` (\`id\`);
    `);

    expect(field(nodes, "categoria", "id")).toMatchObject({ pk: true, ai: true });
    expect(field(nodes, "categoria", "slug").unique).toBe(true);
    expect(field(nodes, "produto", "id")).toMatchObject({ pk: true, ai: false });
    expect(field(nodes, "produto", "categoria_id").fk).toBe(true);
    expect(edges[0].data).toMatchObject({ relationType: "1:N", fkFieldName: "categoria_id" });
  });
});

describe("relacionamentos", () => {
  it("FK com UNIQUE vira 1:1", () => {
    const { edges } = parseSqlToDiagram(`
      CREATE TABLE pessoa (id INT PRIMARY KEY);
      CREATE TABLE passaporte (id INT PRIMARY KEY, pessoa_id INT UNIQUE REFERENCES pessoa(id));
    `);
    expect(edges[0]).toMatchObject({ label: "1:1", data: { relationType: "1:1" } });
  });

  it("tabela associativa (PK = duas FKs) vira N:N com junctionId", () => {
    const { nodes, edges, relationCount } = parseSqlToDiagram(`
      CREATE TABLE aluno (id INT PRIMARY KEY);
      CREATE TABLE curso (id INT PRIMARY KEY);
      CREATE TABLE aluno_curso (
        fk_aluno_id INT NOT NULL REFERENCES aluno(id),
        fk_curso_id INT NOT NULL REFERENCES curso(id),
        nota DECIMAL,
        PRIMARY KEY (fk_aluno_id, fk_curso_id)
      );
    `);
    const aluno = tableByName(nodes, "aluno").id;
    const curso = tableByName(nodes, "curso").id;
    const juncao = tableByName(nodes, "aluno_curso").id;
    const data = { relationType: "1:N", sourceNodeId: aluno, targetNodeId: curso, junctionId: juncao };

    expect(relationCount).toBe(1);
    expect(edges).toMatchObject([
      { source: aluno, target: juncao, data },
      { source: juncao, target: curso, data },
    ]);
    expect(field(nodes, "aluno_curso", "fk_aluno_id")).toMatchObject({ pk: true, fk: true });
  });

  it("FK duplicada (REFERENCES + ALTER TABLE) gera uma aresta só", () => {
    const { edges } = parseSqlToDiagram(`
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
      ALTER TABLE b ADD FOREIGN KEY (a_id) REFERENCES a(id);
    `);
    expect(edges).toHaveLength(1);
  });

  it("FK para tabela fora do script marca a coluna e gera aviso", () => {
    const { nodes, edges, warnings } = parseSqlToDiagram(
      "CREATE TABLE item (id INT PRIMARY KEY, pedido_id INT REFERENCES pedido(id));",
    );
    expect(edges).toEqual([]);
    expect(field(nodes, "item", "pedido_id").fk).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pedido");
  });
});

describe("layout", () => {
  it("tabelas referenciadas ficam à esquerda e nenhuma se sobrepõe", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE c (id INT PRIMARY KEY, b_id INT REFERENCES b(id));
      CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE d (id INT PRIMARY KEY);
    `);
    const x = (name: string) => tableByName(nodes, name).position.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));

    const keys = nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(keys).size).toBe(nodes.length);
  });
});

describe("entradas inválidas", () => {
  it("script sem CREATE TABLE lança SqlImportError", () => {
    expect(() => parseSqlToDiagram("SELECT 1; INSERT INTO x VALUES (1);")).toThrow(SqlImportError);
    expect(() => parseSqlToDiagram("")).toThrow(SqlImportError);
  });

  it("CREATE TABLE ... AS SELECT é ignorado com aviso", () => {
    const { tableCount, warnings } = parseSqlToDiagram(
      "CREATE TABLE a (id INT); CREATE TABLE b AS SELECT * FROM a;",
    );
    expect(tableCount).toBe(1);
    expect(warnings[0]).toContain('"b"');
  });

  it("nunca lança erro inesperado para texto arbitrário", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        try {
          parseSqlToDiagram(`CREATE TABLE t (id INT); ${text}`);
        } catch (error) {
          expect(error).toBeInstanceOf(SqlImportError);
        }
      }),
      { numRuns: 300 },
    );
  });
});

const checksOf = (node: CustomNode) =>
  ((node.data as { checks?: TableCheck[] }).checks ?? []).map(({ name, expression }) => ({ name, expression }));

describe("tamanho, DEFAULT, CHECK e ações de FK", () => {
  it("lê tamanho e precisão só dos tipos que aceitam", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE t (
        a VARCHAR(120), b CHAR(2), c DECIMAL(12, 2), d character varying(40),
        e numeric(8), f timestamp(3) with time zone, g INT(11), h BIT(8), i VARCHAR(MAX)
      );
    `);
    const sizes = Object.fromEntries(fieldsOf(tableByName(nodes, "t")).map((f) => [f.name, f.size ?? null]));
    expect(sizes).toEqual({ id: null, a: "120", b: "2", c: "12,2", d: "40", e: "8", f: "3", g: null, h: "8", i: null });
  });

  it("lê DEFAULT de MySQL e PostgreSQL, sem os casts do pg_dump", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE t (
        id integer NOT NULL,
        status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
        saldo numeric(10,2) DEFAULT (0)::numeric,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expira DATE DEFAULT (now() + interval '30 days'),
        nivel INT DEFAULT -1,
        obs TEXT DEFAULT NULL,
        nome VARCHAR(10) DEFAULT 'a;b' COMMENT 'nome'
      );
      ALTER TABLE ONLY t ALTER COLUMN id SET DEFAULT nextval('t_id_seq'::regclass);
    `);
    const defaults = Object.fromEntries(fieldsOf(tableByName(nodes, "t")).map((f) => [f.name, f.defaultValue ?? null]));
    expect(defaults).toEqual({
      id: null,
      status: "'ativo'",
      saldo: "0",
      criado_em: "CURRENT_TIMESTAMP",
      expira: "(now() + interval '30 days')",
      nivel: "-1",
      obs: null,
      nome: "'a;b'",
    });
    expect(field(nodes, "t", "id").ai).toBe(true);
    expect(field(nodes, "t", "status").notNull).toBe(true);
  });

  it("CHECK de coluna e de tabela, com e sem nome, inclusive por ALTER TABLE", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE produto (
        preco DECIMAL CHECK (preco >= 0),
        estoque INT CONSTRAINT chk_estoque CHECK (estoque >= 0),
        inicio DATE, fim DATE,
        CHECK (fim > inicio),
        CONSTRAINT produto_preco_check CHECK ((preco < (1000)::numeric))
      );
      ALTER TABLE produto ADD CONSTRAINT chk_datas CHECK (fim <> inicio);
    `);
    expect(checksOf(tableByName(nodes, "produto"))).toEqual([
      { name: "chk_produto_1", expression: "preco >= 0" },
      { name: "chk_estoque", expression: "estoque >= 0" },
      { name: "chk_produto_3", expression: "fim > inicio" },
      { name: "produto_preco_check", expression: "(preco < (1000)::numeric)" },
      { name: "chk_datas", expression: "fim <> inicio" },
    ]);
  });

  it("ON DELETE / ON UPDATE nas FKs, inclusive nas da tabela associativa", () => {
    const { edges } = parseSqlToDiagram(`
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (id INT PRIMARY KEY);
      CREATE TABLE c (
        id INT PRIMARY KEY,
        a_id INT REFERENCES a(id) ON UPDATE CASCADE ON DELETE SET NULL,
        b_id INT REFERENCES b(id) ON DELETE NO ACTION
      );
      CREATE TABLE a_b (
        fk_a_id INT, fk_b_id INT, PRIMARY KEY (fk_a_id, fk_b_id),
        FOREIGN KEY (fk_a_id) REFERENCES a (id) MATCH SIMPLE ON DELETE CASCADE,
        FOREIGN KEY (fk_b_id) REFERENCES b (id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
      );
    `);
    const byFk = (name: string) => edges.find((e) => e.data?.fkFieldName === name)?.data;
    expect(byFk("a_id")).toMatchObject({ onDelete: "SET NULL", onUpdate: "CASCADE" });
    expect(byFk("b_id")).not.toHaveProperty("onDelete");

    const junctionEdges = edges.filter((e) => e.data?.junctionId);
    expect(junctionEdges.map((e) => e.data?.onDelete)).toEqual(["CASCADE", "RESTRICT"]);
  });
});

const indexesOf = (node: CustomNode) => (node.data as { indexes?: TableIndex[] }).indexes ?? [];

describe("índices", () => {
  it("lê KEY/INDEX, UNIQUE composto, FULLTEXT e CREATE INDEX", () => {
    const { nodes, indexCount } = parseSqlToDiagram(`
      CREATE TABLE produto (
        id INT PRIMARY KEY,
        nome VARCHAR(80),
        marca VARCHAR(40),
        descricao TEXT,
        sku VARCHAR(20),
        KEY idx_nome (nome),
        INDEX (marca),
        UNIQUE KEY uq_marca_nome (marca, nome),
        FULLTEXT KEY ft_descricao (descricao),
        UNIQUE (sku)
      );
      CREATE INDEX IF NOT EXISTS idx_marca_sku ON public.produto USING btree (marca, sku DESC);
      CREATE UNIQUE INDEX CONCURRENTLY uq_lower ON produto (lower(nome));
    `);
    const produto = tableByName(nodes, "produto");
    const id = (column: string) => field(nodes, "produto", column).id;

    expect(indexCount).toBe(5);
    expect(indexesOf(produto).map(({ name, columns, unique }) => ({ name, columns, unique }))).toEqual([
      { name: "idx_nome", columns: [id("nome")], unique: false },
      { name: "idx_produto_marca", columns: [id("marca")], unique: false },
      { name: "uq_marca_nome", columns: [id("marca"), id("nome")], unique: true },
      { name: "ft_descricao", columns: [id("descricao")], unique: false },
      { name: "idx_marca_sku", columns: [id("marca"), id("sku")], unique: false },
    ]);
    expect(field(nodes, "produto", "sku").unique).toBe(true);
  });

  it("índice com expressão é ignorado com aviso", () => {
    const { warnings } = parseSqlToDiagram(
      "CREATE TABLE p (id INT PRIMARY KEY, nome TEXT); CREATE INDEX idx_lower ON p (lower(nome));",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("idx_lower");
  });

  it("ALTER TABLE ADD INDEX e ADD UNIQUE composto", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE t (a INT, b INT);
      ALTER TABLE t ADD INDEX idx_a (a), ADD CONSTRAINT uq_ab UNIQUE (a, b);
    `);
    expect(indexesOf(tableByName(nodes, "t")).map((i) => [i.name, i.unique])).toEqual([
      ["idx_a", false],
      ["uq_ab", true],
    ]);
  });
});

describe("views", () => {
  it("CREATE VIEW vira viewNode com a consulta original", () => {
    const { nodes, viewCount } = parseSqlToDiagram(`
      CREATE TABLE cliente (id INT PRIMARY KEY, nome TEXT, ativo BOOLEAN);
      -- comentário
      CREATE OR REPLACE VIEW public.clientes_ativos AS
        SELECT id, nome FROM cliente WHERE ativo = true
        WITH CHECK OPTION;
    `);
    const view = nodes.find((n) => n.type === "viewNode")!;

    expect(viewCount).toBe(1);
    expect(view.data).toEqual({
      name: "clientes_ativos",
      sql: "SELECT id, nome FROM cliente WHERE ativo = true\n        WITH CHECK OPTION",
    });
    expect(view.position.x).toBeGreaterThan(tableByName(nodes, "cliente").position.x);
  });

  it("entende o formato do mysqldump (comentários executáveis e DROP)", () => {
    const { nodes, warnings } = parseSqlToDiagram(`
      DROP TABLE IF EXISTS \`cliente\`;
      CREATE TABLE \`cliente\` (\`id\` int NOT NULL, PRIMARY KEY (\`id\`));
      DROP TABLE IF EXISTS \`resumo\`;
      /*!50001 DROP VIEW IF EXISTS \`resumo\`*/;
      /*!50001 CREATE VIEW \`resumo\` AS SELECT
       1 AS \`id\`*/;
      /*!50001 DROP VIEW IF EXISTS \`resumo\`*/;
      /*!50001 CREATE ALGORITHM=UNDEFINED */
      /*!50013 DEFINER=\`root\`@\`localhost\` SQL SECURITY DEFINER */
      /*!50001 VIEW \`resumo\` AS select \`cliente\`.\`id\` AS \`id\` from \`cliente\` */;
    `);

    expect(nodes.map((n) => [n.type, (n.data as { name: string }).name])).toEqual([
      ["entityNode", "cliente"],
      ["viewNode", "resumo"],
    ]);
    expect((nodes[1].data as { sql: string }).sql).toBe("select `cliente`.`id` AS `id` from `cliente`");
    expect(warnings).toEqual([]);
  });

  it("script só com views também é aceito", () => {
    const { tableCount, viewCount } = parseSqlToDiagram("CREATE VIEW v AS SELECT 1;");
    expect([tableCount, viewCount]).toEqual([0, 1]);
  });

  it("CREATE TABLE chamado view_x não é confundido com view", () => {
    const { tableCount, viewCount } = parseSqlToDiagram("CREATE TABLE view_x (id INT);");
    expect([tableCount, viewCount]).toEqual([1, 0]);
  });
});

const withIndexesAndViews = (types: string[]) =>
  diagramArb(types).chain(({ nodes, edges }) =>
    fc
      .record({
        specs: fc.array(
          fc.record({
            table: fc.nat(),
            columns: fc.uniqueArray(fc.nat({ max: 6 }), { minLength: 1, maxLength: 3 }),
            unique: fc.boolean(),
          }),
          { maxLength: 4 },
        ),
        withView: fc.boolean(),
        extras: fc.array(
          fc.record({
            size: fc.constantFrom("1", "20", "6", "10,2", "3"),
            defaultValue: fc.constantFrom(null, "0", "-1", "'a;b'", "CURRENT_TIMESTAMP", "(1 + 2)", "'it''s'"),
          }),
          { minLength: 6, maxLength: 6 },
        ),
        checks: fc.array(fc.constantFrom("x > 0", "length(nome) > 2", "(a <> b)", "status IN ('a', 'b')"), {
          maxLength: 2,
        }),
        actions: fc.array(
          fc.record({
            onDelete: fc.constantFrom<FkAction | null>(null, "CASCADE", "SET NULL", "RESTRICT"),
            onUpdate: fc.constantFrom<FkAction | null>(null, "CASCADE", "NO ACTION"),
          }),
          { minLength: 12, maxLength: 12 },
        ),
      })
      .map(({ specs, withView, extras, checks, actions }) => {
        const entities = nodes.filter((n) => n.type === "entityNode");
        entities.forEach((node, t) => {
          const fields = (node.data as { fields: Field[] }).fields;
          fields.forEach((f, i) => {
            const extra = extras[(i + t) % extras.length];
            if (isValidSize(f.type, extra.size)) f.size = extra.size;
            if (!f.ai && extra.defaultValue) f.defaultValue = extra.defaultValue;
          });
          if (t === 0 && checks.length) {
            (node.data as { checks?: TableCheck[] }).checks = checks.map((expression, k) => ({
              id: `c${k}`,
              name: `chk_${k}`,
              expression,
            }));
          }
        });
        edges.forEach((e, k) => {
          const { onDelete, onUpdate } = actions[k % actions.length];
          e.data = {
            ...e.data!,
            ...(onDelete ? { onDelete } : {}),
            ...(onUpdate && onUpdate !== "NO ACTION" ? { onUpdate } : {}),
          };
        });
        specs.forEach((spec, k) => {
          const node = entities[spec.table % entities.length];
          const fields = (node.data as { fields: Field[] }).fields;
          const columns = [...new Set(spec.columns.map((c) => fields[c % fields.length].id))];
          const data = node.data as { indexes?: TableIndex[] };
          data.indexes = [...(data.indexes ?? []), { id: `i${k}`, name: `idx_${k}`, columns, unique: spec.unique }];
        });
        const view = {
          id: "v",
          type: "viewNode",
          position: { x: 0, y: 0 },
          data: { name: "resumo", sql: "SELECT count(*) AS total FROM x WHERE a = 'b;c'" },
        } as CustomNode;
        return { nodes: withView ? [...nodes, view] : nodes, edges };
      }),
  );

describe("ida e volta com o exportador", () => {
  const roundTrip = (dialect: SqlDialect) =>
    fc.assert(
      fc.property(withIndexesAndViews(ALL_UI_TYPES), ({ nodes, edges }) => {
        const first = generateSqlBlocks(nodes, edges, dialect);
        const script = [
          ...first.blocks.map((b) => b.sql),
          ...first.foreignKeyStatements,
          ...first.indexStatements,
          ...first.viewBlocks.map((b) => b.sql),
        ].join("\n\n");

        const imported = parseSqlToDiagram(first.header + script + first.footer);
        const second = generateSqlBlocks(imported.nodes, imported.edges, dialect);

        expect(imported.warnings).toEqual([]);
        expect(second.blocks.map((b) => b.sql)).toEqual(first.blocks.map((b) => b.sql));
        expect([...second.foreignKeyStatements].sort()).toEqual([...first.foreignKeyStatements].sort());
        expect(second.indexStatements).toEqual(first.indexStatements);
        expect(second.viewBlocks.map((b) => b.sql)).toEqual(first.viewBlocks.map((b) => b.sql));
      }),
      { numRuns: 200 },
    );

  it("MySQL: exportar -> importar -> exportar gera o mesmo script", () => roundTrip("mysql"));
  it("PostgreSQL: exportar -> importar -> exportar gera o mesmo script", () => roundTrip("postgres"));
});

describe("ENUM, SET e descrições", () => {
  it("lê a lista de valores de ENUM e SET do MySQL", () => {
    const { nodes } = parseSqlToDiagram(
      "CREATE TABLE p (id INT PRIMARY KEY, s ENUM('a', 'b''c', 'a') NOT NULL, t SET('x','y'));",
    );
    expect(field(nodes, "p", "s")).toMatchObject({ type: "ENUM", values: ["a", "b'c"], notNull: true });
    expect(field(nodes, "p", "t")).toMatchObject({ type: "SET", values: ["x", "y"] });
  });

  it("transforma o CHECK IN de uma coluna TEXT do PostgreSQL em ENUM", () => {
    const { nodes } = parseSqlToDiagram(
      `CREATE TABLE "p" ("id" SERIAL, "s" TEXT CHECK ("s" IN ('a', 'b')), "o" TEXT CHECK ("o" <> ''), PRIMARY KEY ("id"));`,
    );
    expect(field(nodes, "p", "s")).toMatchObject({ type: "ENUM", values: ["a", "b"] });
    expect(field(nodes, "p", "o").type).toBe("TEXT");
    expect(checksOf(tableByName(nodes, "p")).map((c) => c.expression)).toEqual([`"o" <> ''`]);
  });

  it("lê COMMENT de coluna e de tabela no MySQL", () => {
    const { nodes } = parseSqlToDiagram(
      "CREATE TABLE c (id INT PRIMARY KEY COMMENT 'chave', nome TEXT COMMENT 'nome d''ele') ENGINE=InnoDB COMMENT='clientes';",
    );
    const cliente = tableByName(nodes, "c");
    expect((cliente.data as { description?: string }).description).toBe("clientes");
    expect(field(nodes, "c", "id").description).toBe("chave");
    expect(field(nodes, "c", "nome").description).toBe("nome d'ele");
  });

  it("lê COMMENT ON TABLE e COMMENT ON COLUMN do PostgreSQL", () => {
    const { nodes } = parseSqlToDiagram(`
      CREATE TABLE public.c (id INT PRIMARY KEY, nome TEXT);
      COMMENT ON TABLE public.c IS 'clientes';
      COMMENT ON COLUMN public.c.nome IS 'nome completo';
      COMMENT ON COLUMN c.id IS NULL;
    `);
    expect((tableByName(nodes, "c").data as { description?: string }).description).toBe("clientes");
    expect(field(nodes, "c", "nome").description).toBe("nome completo");
    expect(field(nodes, "c", "id").description).toBeUndefined();
  });
});

describe("chave primária obrigatória", () => {
  it("cria a coluna id como PK quando a tabela não tem chave primária", () => {
    const { nodes, warnings } = parseSqlToDiagram("CREATE TABLE log (msg TEXT, criado DATE);");
    const fields = fieldsOf(tableByName(nodes, "log"));
    expect(fields.map((f) => [f.name, f.type, f.pk, f.ai])).toEqual([
      ["id", "INT", true, true],
      ["msg", "TEXT", false, false],
      ["criado", "DATE", false, false],
    ]);
    expect(warnings).toEqual([expect.stringContaining('foi criada a coluna "id"')]);
  });

  it("promove a coluna id existente em vez de criar outra", () => {
    const { nodes, warnings } = parseSqlToDiagram("CREATE TABLE t (id BIGINT, nome TEXT);");
    const fields = fieldsOf(tableByName(nodes, "t"));
    expect(fields.map((f) => [f.name, f.type, f.pk, f.notNull])).toEqual([
      ["id", "BIGINT", true, true],
      ["nome", "TEXT", false, false],
    ]);
    expect(warnings).toEqual([expect.stringContaining('a coluna "id" virou a PK')]);
  });

  it("não mexe em tabelas que já têm PK, inclusive composta", () => {
    const { nodes, warnings } = parseSqlToDiagram(
      "CREATE TABLE a (x INT, y INT, PRIMARY KEY (x, y)); CREATE TABLE b (codigo INT PRIMARY KEY);",
    );
    expect(fieldsOf(tableByName(nodes, "a")).map((f) => [f.name, f.pk])).toEqual([
      ["x", true],
      ["y", true],
    ]);
    expect(fieldsOf(tableByName(nodes, "b")).map((f) => f.name)).toEqual(["codigo"]);
    expect(warnings).toEqual([]);
  });
});

describe("nomes únicos na importação", () => {
  it("renomeia a view que tem o mesmo nome de uma tabela e avisa", () => {
    const { nodes, warnings } = parseSqlToDiagram(
      "CREATE TABLE resumo (id INT PRIMARY KEY); CREATE VIEW Resumo AS SELECT id FROM resumo;",
    );
    expect(nodes.map((n) => [n.type, (n.data as { name: string }).name])).toEqual([
      ["entityNode", "resumo"],
      ["viewNode", "Resumo_2"],
    ]);
    expect(warnings).toContain('O nome "Resumo" já estava em uso; o item foi renomeado para "Resumo_2".');
  });
});

describe("nomes de atributo únicos na importação", () => {
  it("renomeia colunas repetidas da mesma tabela e avisa", () => {
    const { nodes, warnings } = parseSqlToDiagram("CREATE TABLE t (id INT PRIMARY KEY, nome TEXT, NOME VARCHAR(10));");
    expect(fieldsOf(tableByName(nodes, "t")).map((f) => [f.name, f.type])).toEqual([
      ["id", "INT"],
      ["nome", "TEXT"],
      ["NOME_2", "VARCHAR"],
    ]);
    expect(warnings).toContain('A tabela "t" tinha mais de um atributo "NOME"; um deles foi renomeado para "NOME_2".');
  });
});
