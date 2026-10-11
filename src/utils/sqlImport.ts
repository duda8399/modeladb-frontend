import type { CustomEdge, CustomNode, Field } from "../types/diagramER";

/**
 * Importação de scripts SQL (DDL) para o formato de diagrama do editor.
 *
 * O parser é propositalmente tolerante: interpreta CREATE TABLE, ALTER TABLE
 * e CREATE UNIQUE INDEX de MySQL/MariaDB e PostgreSQL (inclusive dumps do
 * mysqldump, phpMyAdmin e pg_dump) e ignora o resto do script (INSERT, SET,
 * CREATE DATABASE, funções etc.), em vez de abortar no primeiro comando que
 * não reconhece.
 *
 * Os nós e arestas gerados seguem exatamente o formato que o Constructor
 * produz ao criar entidades e relacionamentos (ver handleRelationConfirm), de
 * modo que o diagrama importado pode ser editado e exportado de volta para SQL.
 */

export class SqlImportError extends Error {}

export type SqlImportResult = {
  nodes: CustomNode[];
  edges: CustomEdge[];
  warnings: string[];
  tableCount: number;
  relationCount: number;
};

// ---------------------------------------------------------------------------
// Tokenização
// ---------------------------------------------------------------------------

type TokenKind = "word" | "ident" | "string" | "number" | "punct";

type Token = { kind: TokenKind; value: string };

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_$]/u;

/**
 * Converte o script em uma lista de comandos (cada um, uma lista de tokens),
 * descartando comentários. Strings, identificadores entre aspas/crases/
 * colchetes e blocos $tag$...$tag$ do PostgreSQL são respeitados, então um
 * ";" dentro deles não encerra o comando.
 */
function tokenize(sql: string): Token[][] {
  const statements: Token[][] = [];
  let current: Token[] = [];
  let i = 0;
  const n = sql.length;

  const push = (kind: TokenKind, value: string) => current.push({ kind, value });

  const readDelimited = (close: string, allowBackslash: boolean): string => {
    let value = "";
    i++; // abre
    while (i < n) {
      const ch = sql[i];
      if (allowBackslash && ch === "\\" && i + 1 < n) {
        value += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === close) {
        if (sql[i + 1] === close) {
          value += close;
          i += 2;
          continue;
        }
        i++;
        return value;
      }
      value += ch;
      i++;
    }
    return value;
  };

  while (i < n) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Comentários: -- linha, # linha (MySQL), /* bloco */
    if ((ch === "-" && sql[i + 1] === "-") || ch === "#") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (ch === ";") {
      if (current.length) statements.push(current);
      current = [];
      i++;
      continue;
    }

    if (ch === "'") {
      push("string", readDelimited("'", true));
      continue;
    }
    if (ch === '"') {
      push("ident", readDelimited('"', false));
      continue;
    }
    if (ch === "`") {
      push("ident", readDelimited("`", false));
      continue;
    }
    if (ch === "[") {
      const end = sql.indexOf("]", i + 1);
      const inner = end === -1 ? "" : sql.slice(i + 1, end);
      // "[nome]" é identificador (SQL Server); "[]" e "[3]" são arrays do PostgreSQL.
      if (inner.trim() && !/^\s*\d*\s*$/.test(inner) && !inner.includes("\n")) {
        push("ident", sql.slice(i + 1, end));
        i = end + 1;
        continue;
      }
      push("punct", ch);
      i++;
      continue;
    }

    // Bloco dollar-quoted do PostgreSQL: $$ ... $$ ou $tag$ ... $tag$
    if (ch === "$") {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        const end = sql.indexOf(tag, i + tag.length);
        push("string", sql.slice(i + tag.length, end === -1 ? n : end));
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }

    if (/[0-9]/.test(ch)) {
      let value = "";
      while (i < n && /[0-9.]/.test(sql[i])) value += sql[i++];
      push("number", value);
      continue;
    }

    if (WORD_START.test(ch)) {
      let value = "";
      while (i < n && WORD_PART.test(sql[i])) value += sql[i++];
      push("word", value);
      continue;
    }

    push("punct", ch);
    i++;
  }

  if (current.length) statements.push(current);
  return statements;
}

// ---------------------------------------------------------------------------
// Cursor sobre os tokens de um comando
// ---------------------------------------------------------------------------

class Cursor {
  pos = 0;
  readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  get done() {
    return this.pos >= this.tokens.length;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  /** Verdadeiro se o token atual é a palavra-chave (sem aspas) indicada. */
  isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "word" && token.value.toUpperCase() === word;
  }

  isPunct(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === "punct" && token.value === value;
  }

  /** Consome a sequência de palavras-chave, se ela estiver presente. */
  acceptWords(...words: string[]): boolean {
    if (!words.every((word, index) => this.isWord(word, index))) return false;
    this.pos += words.length;
    return true;
  }

  acceptPunct(value: string): boolean {
    if (!this.isPunct(value)) return false;
    this.pos++;
    return true;
  }

  /** Lê um nome possivelmente qualificado (schema.tabela) e devolve a última parte. */
  readName(): string | null {
    const first = this.next();
    if (!first || (first.kind !== "word" && first.kind !== "ident" && first.kind !== "string")) {
      return null;
    }
    let name = first.value;
    while (this.isPunct(".")) {
      this.pos++;
      const part = this.next();
      if (!part) break;
      name = part.value;
    }
    return name;
  }

  /** Pula um grupo entre parênteses (o cursor deve estar no "("). */
  skipGroup(): Token[] {
    const inner: Token[] = [];
    if (!this.isPunct("(")) return inner;
    let depth = 0;
    while (!this.done) {
      const token = this.next()!;
      if (token.kind === "punct" && token.value === "(") {
        depth++;
        if (depth === 1) continue;
      } else if (token.kind === "punct" && token.value === ")") {
        depth--;
        if (depth === 0) break;
      }
      inner.push(token);
    }
    return inner;
  }

  /** Lê "(a, b, c)" como lista de nomes de coluna. */
  readNameList(): string[] {
    return splitTopLevel(this.skipGroup())
      .map((part) => part.find((t) => t.kind === "word" || t.kind === "ident")?.value)
      .filter((name): name is string => !!name);
  }
}

/** Divide tokens por vírgulas que não estejam dentro de parênteses. */
function splitTopLevel(tokens: Token[]): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;

  for (const token of tokens) {
    if (token.kind === "punct") {
      if (token.value === "(") depth++;
      else if (token.value === ")") depth--;
      else if (token.value === "," && depth === 0) {
        parts.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  if (current.length) parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Tipos de dados
// ---------------------------------------------------------------------------

/** Tipos oferecidos no modal de atributos (AttributesModal). */
const UI_TYPES = new Set([
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
  "CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET",
  "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "BOOLEAN", "JSON", "GEOMETRY", "POINT",
]);

/** Tipos com auto incremento embutido (PostgreSQL). */
const SERIAL_TYPES: Record<string, string> = {
  SMALLSERIAL: "SMALLINT",
  SERIAL2: "SMALLINT",
  SERIAL: "INT",
  SERIAL4: "INT",
  BIGSERIAL: "BIGINT",
  SERIAL8: "BIGINT",
};

/** Sinônimos de outros bancos para os tipos que o editor oferece. */
const TYPE_ALIASES: Record<string, string> = {
  INTEGER: "INT",
  INT4: "INT",
  INT2: "SMALLINT",
  INT8: "BIGINT",
  INT1: "TINYINT",
  MIDDLEINT: "MEDIUMINT",
  NUMERIC: "DECIMAL",
  DEC: "DECIMAL",
  FIXED: "DECIMAL",
  NUMBER: "DECIMAL",
  MONEY: "DECIMAL",
  SMALLMONEY: "DECIMAL",
  REAL: "FLOAT",
  FLOAT4: "FLOAT",
  FLOAT8: "DOUBLE",
  "DOUBLE PRECISION": "DOUBLE",
  BOOL: "BOOLEAN",
  "CHARACTER VARYING": "VARCHAR",
  "CHAR VARYING": "VARCHAR",
  "NATIONAL CHARACTER VARYING": "VARCHAR",
  "NATIONAL VARCHAR": "VARCHAR",
  NVARCHAR: "VARCHAR",
  NVARCHAR2: "VARCHAR",
  VARCHAR2: "VARCHAR",
  CHARACTER: "CHAR",
  "NATIONAL CHARACTER": "CHAR",
  "NATIONAL CHAR": "CHAR",
  NCHAR: "CHAR",
  BPCHAR: "CHAR",
  CITEXT: "TEXT",
  NTEXT: "TEXT",
  CLOB: "LONGTEXT",
  "TIMESTAMP WITH TIME ZONE": "TIMESTAMP",
  "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
  TIMESTAMPTZ: "TIMESTAMP",
  "TIME WITH TIME ZONE": "TIME",
  "TIME WITHOUT TIME ZONE": "TIME",
  TIMETZ: "TIME",
  DATETIME2: "DATETIME",
  SMALLDATETIME: "DATETIME",
  DATETIMEOFFSET: "DATETIME",
  BYTEA: "BLOB",
  IMAGE: "LONGBLOB",
  JSONB: "JSON",
  "BIT VARYING": "BIT",
  VARBIT: "BIT",
};

/** Modificadores que não fazem parte do nome do tipo. */
const TYPE_MODIFIERS = new Set(["UNSIGNED", "SIGNED", "ZEROFILL", "BINARY", "ASCII", "UNICODE"]);

function normalizeType(rawWords: string[], isArray: boolean): { type: string | null; ai: boolean } {
  if (!rawWords.length) return { type: null, ai: false };

  const words = rawWords.map((w) => w.toUpperCase());
  // "BINARY" sozinho é um tipo; como modificador ("VARCHAR(10) BINARY") é descartado.
  const core = words.filter((w, index) => index === 0 || !TYPE_MODIFIERS.has(w));
  const joined = core.join(" ");

  if (isArray) return { type: "JSON", ai: false };
  if (SERIAL_TYPES[joined]) return { type: SERIAL_TYPES[joined], ai: true };
  if (TYPE_ALIASES[joined]) return { type: TYPE_ALIASES[joined], ai: false };

  // Ex.: "DOUBLE" seguido de algo não reconhecido -> usa só a primeira palavra.
  if (UI_TYPES.has(joined)) return { type: joined, ai: false };
  if (TYPE_ALIASES[core[0]]) return { type: TYPE_ALIASES[core[0]], ai: false };
  if (SERIAL_TYPES[core[0]]) return { type: SERIAL_TYPES[core[0]], ai: true };
  if (UI_TYPES.has(core[0])) return { type: core[0], ai: false };

  return { type: joined, ai: false };
}

// ---------------------------------------------------------------------------
// Modelo intermediário
// ---------------------------------------------------------------------------

type ColumnDef = {
  name: string;
  type: string | null;
  pk: boolean;
  fk: boolean;
  notNull: boolean;
  unique: boolean;
  ai: boolean;
};

type TableDef = {
  name: string;
  columns: ColumnDef[];
  primaryKey: string[];
};

type ForeignKeyDef = {
  table: string;
  columns: string[];
  refTable: string;
};

/** Palavras que encerram o nome do tipo em uma definição de coluna. */
const COLUMN_STOP_WORDS = new Set([
  "NOT", "NULL", "PRIMARY", "UNIQUE", "DEFAULT", "AUTO_INCREMENT", "AUTOINCREMENT",
  "REFERENCES", "CHECK", "CONSTRAINT", "GENERATED", "COLLATE", "COMMENT", "ON",
  "IDENTITY", "KEY", "AS", "VISIBLE", "INVISIBLE", "STORED", "VIRTUAL", "CHARSET",
  "SRID", "COLUMN_FORMAT", "STORAGE", "ENCODE",
]);

const TABLE_CONSTRAINT_WORDS = new Set([
  "CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "KEY", "INDEX", "FULLTEXT", "SPATIAL",
  "CHECK", "EXCLUDE", "LIKE",
]);

class SchemaBuilder {
  private tables = new Map<string, TableDef>();
  private foreignKeys: ForeignKeyDef[] = [];
  readonly warnings: string[] = [];

  getTable(name: string): TableDef | undefined {
    return this.tables.get(name.toLowerCase());
  }

  getColumn(table: TableDef, name: string): ColumnDef | undefined {
    const lower = name.toLowerCase();
    return table.columns.find((c) => c.name.toLowerCase() === lower);
  }

  get allTables(): TableDef[] {
    return [...this.tables.values()];
  }

  get allForeignKeys(): ForeignKeyDef[] {
    return this.foreignKeys;
  }

  // -- Comandos ------------------------------------------------------------

  handleStatement(tokens: Token[]) {
    const cur = new Cursor(tokens);

    if (cur.acceptWords("CREATE")) {
      cur.acceptWords("OR", "REPLACE");
      if (cur.isWord("UNIQUE") || cur.isWord("INDEX")) {
        this.handleCreateIndex(cur);
        return;
      }
      while (
        cur.acceptWords("TEMPORARY") ||
        cur.acceptWords("TEMP") ||
        cur.acceptWords("UNLOGGED") ||
        cur.acceptWords("GLOBAL") ||
        cur.acceptWords("LOCAL")
      ) {
        // modificadores ignorados
      }
      if (cur.acceptWords("TABLE")) this.handleCreateTable(cur);
      return;
    }

    if (cur.acceptWords("ALTER", "TABLE")) {
      this.handleAlterTable(cur);
    }
  }

  private handleCreateTable(cur: Cursor) {
    cur.acceptWords("IF", "NOT", "EXISTS");
    const name = cur.readName();
    if (!name) return;

    if (!cur.isPunct("(")) {
      this.warnings.push(
        `A tabela "${name}" foi ignorada: CREATE TABLE ... AS/LIKE não traz a definição das colunas.`,
      );
      return;
    }

    const table: TableDef = { name, columns: [], primaryKey: [] };
    const pendingFks: ForeignKeyDef[] = [];

    for (const item of splitTopLevel(cur.skipGroup())) {
      if (!item.length) continue;
      const first = item[0];

      if (first.kind === "word" && TABLE_CONSTRAINT_WORDS.has(first.value.toUpperCase())) {
        this.applyTableConstraint(table, new Cursor(item), pendingFks);
      } else {
        const column = this.parseColumn(table, new Cursor(item), pendingFks);
        if (column) table.columns.push(column);
      }
    }

    // Um script pode recriar a tabela (DROP + CREATE); vale a última definição.
    const key = name.toLowerCase();
    if (this.tables.has(key)) {
      this.foreignKeys = this.foreignKeys.filter((fk) => fk.table.toLowerCase() !== key);
    }
    this.tables.set(key, table);
    this.foreignKeys.push(...pendingFks);
    this.syncPrimaryKey(table);
  }

  private handleAlterTable(cur: Cursor) {
    cur.acceptWords("IF", "EXISTS");
    cur.acceptWords("ONLY");
    const name = cur.readName();
    if (!name) return;

    const table = this.getTable(name);
    if (!table) {
      // pg_dump emite ALTER TABLE para sequências e views (OWNER TO etc.);
      // só vale avisar quando o comando mexeria em chaves.
      const words = cur.tokens.map((t) => t.value.toUpperCase());
      if (words.includes("FOREIGN") || words.includes("PRIMARY")) {
        this.warnings.push(`ALTER TABLE ignorado: a tabela "${name}" não foi criada no script.`);
      }
      return;
    }

    const actions = splitTopLevel(cur.tokens.slice(cur.pos));
    for (const action of actions) {
      const ac = new Cursor(action);

      if (ac.acceptWords("ADD")) {
        if (ac.isWord("CONSTRAINT") || ac.isWord("PRIMARY") || ac.isWord("UNIQUE") ||
            ac.isWord("FOREIGN") || ac.isWord("KEY") || ac.isWord("INDEX") ||
            ac.isWord("FULLTEXT") || ac.isWord("SPATIAL") || ac.isWord("CHECK")) {
          this.applyTableConstraint(table, ac, this.foreignKeys);
        } else {
          ac.acceptWords("COLUMN");
          ac.acceptWords("IF", "NOT", "EXISTS");
          const column = this.parseColumn(table, ac, this.foreignKeys);
          if (column && !this.getColumn(table, column.name)) table.columns.push(column);
        }
        continue;
      }

      // MySQL/phpMyAdmin: MODIFY [COLUMN] col definição / CHANGE [COLUMN] antigo novo definição
      if (ac.acceptWords("MODIFY") || ac.isWord("CHANGE")) {
        const isChange = ac.acceptWords("CHANGE");
        ac.acceptWords("COLUMN");
        const oldName = isChange ? ac.readName() : null;
        const column = this.parseColumn(table, ac, this.foreignKeys);
        if (!column) continue;
        const existing = this.getColumn(table, oldName ?? column.name);
        if (existing) {
          existing.name = column.name;
          existing.type = column.type ?? existing.type;
          existing.notNull ||= column.notNull;
          existing.unique ||= column.unique;
          existing.ai ||= column.ai;
          existing.pk ||= column.pk;
        }
        continue;
      }

      // PostgreSQL (pg_dump): ALTER COLUMN col SET DEFAULT nextval(...) / SET NOT NULL /
      // ADD GENERATED ... AS IDENTITY
      if (ac.acceptWords("ALTER")) {
        ac.acceptWords("COLUMN");
        const columnName = ac.readName();
        const column = columnName ? this.getColumn(table, columnName) : undefined;
        if (!column) continue;
        const words = action.filter((t) => t.kind === "word").map((t) => t.value.toUpperCase());
        if (words.includes("NEXTVAL") || words.includes("IDENTITY")) column.ai = true;
        if (ac.acceptWords("SET", "NOT", "NULL")) column.notNull = true;
      }
    }

    this.syncPrimaryKey(table);
  }

  private handleCreateIndex(cur: Cursor) {
    const unique = cur.acceptWords("UNIQUE");
    if (!cur.acceptWords("INDEX")) return;
    if (!unique) return;

    while (!cur.done && !cur.isWord("ON")) cur.next();
    if (!cur.acceptWords("ON")) return;
    cur.acceptWords("ONLY");
    const tableName = cur.readName();
    const table = tableName ? this.getTable(tableName) : undefined;
    if (!table) return;

    while (!cur.done && !cur.isPunct("(")) cur.next(); // USING btree etc.
    const columns = cur.readNameList();
    if (columns.length === 1) {
      const column = this.getColumn(table, columns[0]);
      if (column) column.unique = true;
    }
  }

  // -- Definições ----------------------------------------------------------

  private parseColumn(table: TableDef, cur: Cursor, fks: ForeignKeyDef[]): ColumnDef | null {
    const nameToken = cur.next();
    if (!nameToken || (nameToken.kind !== "word" && nameToken.kind !== "ident")) return null;

    // Tipo: palavras (e grupos de parâmetros) até a primeira restrição.
    const typeWords: string[] = [];
    let isArray = false;
    while (!cur.done) {
      const token = cur.peek()!;
      if (token.kind === "punct") {
        if (token.value === "(") {
          cur.skipGroup();
          continue;
        }
        if (token.value === "[") {
          isArray = true;
          cur.next();
          cur.acceptPunct("]");
          continue;
        }
        break;
      }
      if (token.kind !== "word") break;
      const upper = token.value.toUpperCase();
      if (COLUMN_STOP_WORDS.has(upper)) break;
      // "CHARACTER SET utf8" é charset, mas "CHARACTER VARYING" é tipo.
      if (upper === "CHARACTER" && typeWords.length > 0 && cur.isWord("SET", 1)) break;
      if (upper === "ARRAY") isArray = true;
      else typeWords.push(token.value);
      cur.next();
    }

    const { type, ai: serial } = normalizeType(typeWords, isArray);
    const column: ColumnDef = {
      name: nameToken.value,
      type,
      pk: false,
      fk: false,
      notNull: false,
      unique: false,
      ai: serial,
    };

    // Restrições: só palavras no nível zero contam (CHECK (...) e DEFAULT '...' são pulados).
    while (!cur.done) {
      if (cur.isPunct("(")) {
        cur.skipGroup();
        continue;
      }
      if (cur.acceptWords("NOT", "NULL")) column.notNull = true;
      else if (cur.acceptWords("PRIMARY", "KEY")) column.pk = true;
      else if (cur.acceptWords("UNIQUE")) {
        column.unique = true;
        cur.acceptWords("KEY");
      } else if (
        cur.acceptWords("AUTO_INCREMENT") ||
        cur.acceptWords("AUTOINCREMENT") ||
        cur.acceptWords("IDENTITY")
      ) {
        column.ai = true;
      } else if (cur.acceptWords("DEFAULT")) {
        if (cur.isWord("NEXTVAL")) column.ai = true;
      } else if (cur.acceptWords("REFERENCES")) {
        const refTable = cur.readName();
        if (refTable) fks.push({ table: table.name, columns: [column.name], refTable });
      } else {
        cur.next();
      }
    }

    if (column.pk) {
      column.notNull = true;
      if (!table.primaryKey.some((c) => c.toLowerCase() === column.name.toLowerCase())) {
        table.primaryKey.push(column.name);
      }
    }

    return column;
  }

  private applyTableConstraint(table: TableDef, cur: Cursor, fks: ForeignKeyDef[]) {
    if (cur.acceptWords("CONSTRAINT")) {
      // O nome é opcional no MySQL ("CONSTRAINT FOREIGN KEY ...").
      if (!cur.isWord("PRIMARY") && !cur.isWord("UNIQUE") && !cur.isWord("FOREIGN") && !cur.isWord("CHECK")) {
        cur.readName();
      }
    }

    if (cur.acceptWords("PRIMARY", "KEY")) {
      while (!cur.done && !cur.isPunct("(")) cur.next();
      const columns = cur.readNameList();
      if (columns.length) table.primaryKey = columns;
      return;
    }

    if (cur.acceptWords("UNIQUE")) {
      while (!cur.done && !cur.isPunct("(")) cur.next(); // KEY/INDEX nome
      const columns = cur.readNameList();
      if (columns.length === 1) {
        const column = this.getColumn(table, columns[0]);
        if (column) column.unique = true;
      }
      return;
    }

    if (cur.acceptWords("FOREIGN", "KEY")) {
      while (!cur.done && !cur.isPunct("(")) cur.next(); // nome opcional (MySQL)
      const columns = cur.readNameList();
      if (!cur.acceptWords("REFERENCES")) return;
      const refTable = cur.readName();
      if (columns.length && refTable) fks.push({ table: table.name, columns, refTable });
    }

    // KEY, INDEX, FULLTEXT, SPATIAL, CHECK, EXCLUDE, LIKE: sem efeito no diagrama.
  }

  /** Marca como PK as colunas listadas na chave primária da tabela. */
  private syncPrimaryKey(table: TableDef) {
    const pkNames = new Set(table.primaryKey.map((c) => c.toLowerCase()));
    for (const column of table.columns) {
      if (pkNames.has(column.name.toLowerCase())) {
        column.pk = true;
        column.notNull = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Montagem do diagrama
// ---------------------------------------------------------------------------

const newId = () => globalThis.crypto.randomUUID();

const NODE_WIDTH = 300;
const COLUMN_GAP = 140;
const ROW_GAP = 80;

/** Altura aproximada de uma entidade no canvas (cabeçalho + linhas + rodapé). */
function estimateHeight(fieldCount: number): number {
  return 90 + Math.max(fieldCount, 1) * 32;
}

/**
 * Layout em camadas: tabelas referenciadas ficam à esquerda e as que apontam
 * para elas, à direita, para as linhas de relacionamento fluírem num sentido.
 * Camadas muito altas são quebradas em mais de uma coluna.
 */
function layoutTables(
  tables: TableDef[],
  dependencies: Map<string, Set<string>>,
): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const visiting = new Set<string>();

  const computeLevel = (key: string): number => {
    if (level.has(key)) return level.get(key)!;
    if (visiting.has(key)) return 0; // ciclo: quebra aqui
    visiting.add(key);
    let value = 0;
    for (const dep of dependencies.get(key) ?? []) {
      if (dep !== key) value = Math.max(value, computeLevel(dep) + 1);
    }
    visiting.delete(key);
    level.set(key, value);
    return value;
  };

  const keys = tables.map((t) => t.name.toLowerCase());
  keys.forEach(computeLevel);

  const maxPerColumn = Math.max(3, Math.ceil(Math.sqrt(tables.length)));
  const byLevel = new Map<number, TableDef[]>();
  for (const table of tables) {
    const lvl = level.get(table.name.toLowerCase()) ?? 0;
    byLevel.set(lvl, [...(byLevel.get(lvl) ?? []), table]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let columnIndex = 0;

  for (const lvl of [...byLevel.keys()].sort((a, b) => a - b)) {
    const group = byLevel.get(lvl)!;
    for (let start = 0; start < group.length; start += maxPerColumn) {
      let y = 0;
      for (const table of group.slice(start, start + maxPerColumn)) {
        positions.set(table.name.toLowerCase(), {
          x: columnIndex * (NODE_WIDTH + COLUMN_GAP),
          y,
        });
        y += estimateHeight(table.columns.length) + ROW_GAP;
      }
      columnIndex++;
    }
  }

  return positions;
}

/**
 * Converte um script SQL (DDL) em nós e arestas do editor.
 * Lança SqlImportError se o script não tiver nenhum CREATE TABLE.
 */
export function parseSqlToDiagram(sql: string): SqlImportResult {
  const builder = new SchemaBuilder();

  for (const statement of tokenize(sql)) {
    try {
      builder.handleStatement(statement);
    } catch {
      const preview = statement.slice(0, 6).map((t) => t.value).join(" ");
      builder.warnings.push(`Não foi possível interpretar o comando "${preview}...".`);
    }
  }

  const tables = builder.allTables;
  if (!tables.length) {
    throw new SqlImportError("Nenhum CREATE TABLE foi encontrado no arquivo SQL.");
  }

  const warnings = [...builder.warnings];

  // Resolve as FKs (só as que apontam para tabelas existentes) e marca as colunas.
  // Uma mesma FK pode aparecer duas vezes (REFERENCES na coluna + ALTER TABLE).
  const seenFks = new Set<string>();
  const fks = builder.allForeignKeys.filter((fk) => {
    const fkKey = `${fk.table}.${fk.columns.join(",")}`.toLowerCase();
    if (seenFks.has(fkKey)) return false;
    seenFks.add(fkKey);

    const table = builder.getTable(fk.table);
    const refTable = builder.getTable(fk.refTable);
    if (!table) return false;
    if (!refTable) {
      warnings.push(
        `A chave estrangeira ${fk.table}.${fk.columns.join(", ")} referencia a tabela ` +
          `"${fk.refTable}", que não está no script; o relacionamento foi ignorado.`,
      );
    }
    for (const columnName of fk.columns) {
      const column = builder.getColumn(table, columnName);
      if (column) column.fk = true;
    }
    return !!refTable;
  });

  // Uma tabela associativa (N:N) tem exatamente duas FKs de uma coluna, para
  // tabelas diferentes, e a chave primária é formada por essas duas colunas.
  const fksByTable = new Map<string, ForeignKeyDef[]>();
  for (const fk of fks) {
    const key = fk.table.toLowerCase();
    fksByTable.set(key, [...(fksByTable.get(key) ?? []), fk]);
  }

  const junctionKeys = new Set<string>();
  for (const table of tables) {
    const key = table.name.toLowerCase();
    const tableFks = fksByTable.get(key) ?? [];
    if (tableFks.length !== 2) continue;
    if (tableFks.some((fk) => fk.columns.length !== 1)) continue;
    const [a, b] = tableFks;
    if (a.refTable.toLowerCase() === b.refTable.toLowerCase()) continue;
    if ([a, b].some((fk) => fk.refTable.toLowerCase() === key)) continue;
    const pk = new Set(table.primaryKey.map((c) => c.toLowerCase()));
    const fkCols = new Set([a.columns[0].toLowerCase(), b.columns[0].toLowerCase()]);
    if (pk.size === 2 && [...pk].every((c) => fkCols.has(c))) junctionKeys.add(key);
  }

  // Dependências para o layout: cada tabela depende das que ela referencia.
  const dependencies = new Map<string, Set<string>>();
  for (const fk of fks) {
    const key = fk.table.toLowerCase();
    if (!dependencies.has(key)) dependencies.set(key, new Set());
    dependencies.get(key)!.add(fk.refTable.toLowerCase());
  }
  const positions = layoutTables(tables, dependencies);

  // Nós
  const nodeIdByTable = new Map<string, string>();
  const nodes: CustomNode[] = tables.map((table) => {
    const id = newId();
    nodeIdByTable.set(table.name.toLowerCase(), id);

    const fields: (Field & { order: number })[] = table.columns.map((column, index) => ({
      id: newId(),
      name: column.name,
      type: column.type,
      pk: column.pk,
      fk: column.fk,
      notNull: column.notNull || column.pk,
      unique: column.unique,
      ai: column.ai,
      order: index,
    }));

    if (fields.some((f) => !f.type)) {
      warnings.push(`A tabela "${table.name}" tem colunas sem tipo; defina o tipo no editor.`);
    }

    return {
      id,
      type: "entityNode",
      position: positions.get(table.name.toLowerCase()) ?? { x: 0, y: 0 },
      data: { name: table.name, fields },
    } as CustomNode;
  });

  // Arestas
  const edges: CustomEdge[] = [];
  let relationCount = 0;

  for (const junctionKey of junctionKeys) {
    const junction = builder.getTable(junctionKey)!;
    // Ordem das colunas na tabela define origem/destino, como o exportador espera.
    const [first, second] = [...fksByTable.get(junctionKey)!].sort(
      (a, b) =>
        junction.columns.findIndex((c) => c.name.toLowerCase() === a.columns[0].toLowerCase()) -
        junction.columns.findIndex((c) => c.name.toLowerCase() === b.columns[0].toLowerCase()),
    );

    const junctionId = nodeIdByTable.get(junctionKey)!;
    const sourceNodeId = nodeIdByTable.get(first.refTable.toLowerCase())!;
    const targetNodeId = nodeIdByTable.get(second.refTable.toLowerCase())!;
    const data = { relationType: "1:N" as const, sourceNodeId, targetNodeId, junctionId };

    edges.push(
      { id: newId(), source: sourceNodeId, target: junctionId, label: "1:N", type: "floating", data },
      { id: newId(), source: junctionId, target: targetNodeId, label: "1:N", type: "floating", data },
    );
    relationCount++;
  }

  for (const fk of fks) {
    if (junctionKeys.has(fk.table.toLowerCase())) continue;

    const table = builder.getTable(fk.table)!;
    const sourceNodeId = nodeIdByTable.get(fk.refTable.toLowerCase())!;
    const targetNodeId = nodeIdByTable.get(fk.table.toLowerCase())!;
    const fkColumn = builder.getColumn(table, fk.columns[0]);
    const fkFieldName = fkColumn?.name ?? fk.columns[0];

    // 1:1 quando a coluna FK não pode se repetir (UNIQUE ou é a própria PK).
    const isOneToOne =
      fk.columns.length === 1 &&
      !!fkColumn &&
      (fkColumn.unique ||
        (table.primaryKey.length === 1 &&
          table.primaryKey[0].toLowerCase() === fkColumn.name.toLowerCase()));
    const relationType = isOneToOne ? ("1:1" as const) : ("1:N" as const);

    edges.push({
      id: newId(),
      source: sourceNodeId,
      target: targetNodeId,
      label: relationType,
      type: "floating",
      data: { relationType, sourceNodeId, targetNodeId, fkFieldName },
    });
    relationCount++;
  }

  return { nodes, edges, warnings, tableCount: nodes.length, relationCount };
}
