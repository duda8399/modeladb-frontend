import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSqlToDiagram, SqlImportError } from "./sqlImport";
import { generateSqlBlocks, type SqlDialect } from "./sqlExport";
import { ALL_UI_TYPES, diagramArb } from "../test/erArbitraries";
import type { CustomNode, Field } from "../types/diagramER";

/**
 * Importação SQL -> diagrama.
 * Cobre scripts escritos à mão, dumps reais (mysqldump/phpMyAdmin/pg_dump) e
 * a ida e volta com o exportador: exportar -> importar -> exportar de novo
 * precisa gerar o mesmo SQL.
 */

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
        data: { relationType: "1:N", sourceNodeId: cliente.id, targetNodeId: pedido.id, fkFieldName: "cliente_id" },
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
    expect(field(nodes, "users", "email")).toMatchObject({ unique: true, notNull: true });
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

describe("ida e volta com o exportador", () => {
  const roundTrip = (dialect: SqlDialect) =>
    fc.assert(
      fc.property(diagramArb(ALL_UI_TYPES), ({ nodes, edges }) => {
        const first = generateSqlBlocks(nodes, edges, dialect);
        const script = [...first.blocks.map((b) => b.sql), ...first.foreignKeyStatements].join("\n\n");

        const imported = parseSqlToDiagram(first.header + script + first.footer);
        const second = generateSqlBlocks(imported.nodes, imported.edges, dialect);

        expect(imported.warnings).toEqual([]);
        expect(second.blocks.map((b) => b.sql)).toEqual(first.blocks.map((b) => b.sql));
        expect([...second.foreignKeyStatements].sort()).toEqual([...first.foreignKeyStatements].sort());
      }),
      { numRuns: 200 },
    );

  it("MySQL: exportar -> importar -> exportar gera o mesmo script", () => roundTrip("mysql"));
  it("PostgreSQL: exportar -> importar -> exportar gera o mesmo script", () => roundTrip("postgres"));
});
