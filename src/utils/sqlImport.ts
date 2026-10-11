import type { CustomEdge, CustomNode, Field, TableIndex } from "../types/diagramER";
import { Cursor, splitTopLevel, tokenize, type Token } from "./sqlTokenizer";
import { defaultIndexName } from "./sqlExport";
import { analyzeViewSql } from "./viewSql";

export class SqlImportError extends Error {}

export type SqlImportResult = {
  nodes: CustomNode[];
  edges: CustomEdge[];
  warnings: string[];
  tableCount: number;
  relationCount: number;
  viewCount: number;
  indexCount: number;
};

const UI_TYPES = new Set([
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
  "CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET",
  "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "BOOLEAN", "JSON", "GEOMETRY", "POINT",
]);

const SERIAL_TYPES: Record<string, string> = {
  SMALLSERIAL: "SMALLINT",
  SERIAL2: "SMALLINT",
  SERIAL: "INT",
  SERIAL4: "INT",
  BIGSERIAL: "BIGINT",
  SERIAL8: "BIGINT",
};

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

const TYPE_MODIFIERS = new Set(["UNSIGNED", "SIGNED", "ZEROFILL", "BINARY", "ASCII", "UNICODE"]);

function normalizeType(rawWords: string[], isArray: boolean): { type: string | null; ai: boolean } {
  if (!rawWords.length) return { type: null, ai: false };

  const words = rawWords.map((w) => w.toUpperCase());
  const core = words.filter((w, index) => index === 0 || !TYPE_MODIFIERS.has(w));
  const joined = core.join(" ");

  if (isArray) return { type: "JSON", ai: false };
  if (SERIAL_TYPES[joined]) return { type: SERIAL_TYPES[joined], ai: true };
  if (TYPE_ALIASES[joined]) return { type: TYPE_ALIASES[joined], ai: false };

  if (UI_TYPES.has(joined)) return { type: joined, ai: false };
  if (TYPE_ALIASES[core[0]]) return { type: TYPE_ALIASES[core[0]], ai: false };
  if (SERIAL_TYPES[core[0]]) return { type: SERIAL_TYPES[core[0]], ai: true };
  if (UI_TYPES.has(core[0])) return { type: core[0], ai: false };

  return { type: joined, ai: false };
}

type ColumnDef = {
  name: string;
  type: string | null;
  pk: boolean;
  fk: boolean;
  notNull: boolean;
  unique: boolean;
  ai: boolean;
};

type IndexDef = {
  name: string | null;
  columns: string[];
  unique: boolean;
};

type TableDef = {
  name: string;
  columns: ColumnDef[];
  primaryKey: string[];
  indexes: IndexDef[];
};

type ViewDef = {
  name: string;
  sql: string;
};

type ForeignKeyDef = {
  table: string;
  columns: string[];
  refTable: string;
};

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
  private views = new Map<string, ViewDef>();
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

  get allViews(): ViewDef[] {
    return [...this.views.values()];
  }

  handleStatement(tokens: Token[], sql: string) {
    const cur = new Cursor(tokens);

    if (cur.acceptWords("CREATE")) {
      cur.acceptWords("OR", "REPLACE");
      if (cur.isWord("UNIQUE") || cur.isWord("INDEX")) {
        this.handleCreateIndex(cur);
        return;
      }
      const viewAt = this.findViewKeyword(cur);
      if (viewAt !== -1) {
        cur.pos = viewAt + 1;
        this.handleCreateView(cur, sql);
        return;
      }
      const modifiers = ["TEMPORARY", "TEMP", "UNLOGGED", "GLOBAL", "LOCAL"];
      while (modifiers.some((word) => cur.acceptWords(word))) continue;
      if (cur.acceptWords("TABLE")) this.handleCreateTable(cur);
      return;
    }

    if (cur.acceptWords("ALTER", "TABLE")) {
      this.handleAlterTable(cur);
      return;
    }

    if (cur.acceptWords("DROP")) {
      this.handleDrop(cur);
    }
  }

  private findViewKeyword(cur: Cursor): number {
    for (let i = cur.pos; i < cur.tokens.length; i++) {
      const token = cur.tokens[i];
      if (token.kind === "punct" && token.value === "(") return -1;
      if (token.kind !== "word") continue;
      const upper = token.value.toUpperCase();
      if (upper === "VIEW") return i;
      if (upper === "TABLE" || upper === "AS") return -1;
    }
    return -1;
  }

  private handleCreateView(cur: Cursor, sql: string) {
    cur.acceptWords("IF", "NOT", "EXISTS");
    const name = cur.readName();
    if (!name) return;

    while (!cur.done && !cur.isWord("AS")) {
      if (cur.isPunct("(")) cur.skipGroup();
      else cur.next();
    }
    if (!cur.acceptWords("AS")) return;

    const first = cur.peek();
    const last = cur.tokens[cur.tokens.length - 1];
    if (!first) return;

    this.views.set(name.toLowerCase(), { name, sql: sql.slice(first.start, last.end).trim() });
  }

  private handleDrop(cur: Cursor) {
    cur.acceptWords("TEMPORARY");
    cur.acceptWords("MATERIALIZED");
    const isTable = cur.acceptWords("TABLE");
    if (!isTable && !cur.acceptWords("VIEW")) return;
    cur.acceptWords("IF", "EXISTS");

    for (const part of splitTopLevel(cur.tokens.slice(cur.pos))) {
      const name = new Cursor(part).readName();
      if (!name) continue;
      const key = name.toLowerCase();
      if (isTable) {
        this.tables.delete(key);
        this.foreignKeys = this.foreignKeys.filter((fk) => fk.table.toLowerCase() !== key);
      } else {
        this.views.delete(key);
      }
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

    const table: TableDef = { name, columns: [], primaryKey: [], indexes: [] };
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
    cur.acceptWords("CONCURRENTLY");
    cur.acceptWords("IF", "NOT", "EXISTS");
    const indexName = cur.isWord("ON") ? null : cur.readName();

    if (!cur.acceptWords("ON")) return;
    cur.acceptWords("ONLY");
    const tableName = cur.readName();
    const table = tableName ? this.getTable(tableName) : undefined;
    if (!table) {
      if (tableName) {
        this.warnings.push(`O índice "${indexName ?? ""}" foi ignorado: a tabela "${tableName}" não foi criada no script.`);
      }
      return;
    }

    while (!cur.done && !cur.isPunct("(")) cur.next();
    table.indexes.push({ name: indexName, columns: cur.readNameList(), unique });
  }

  private parseColumn(table: TableDef, cur: Cursor, fks: ForeignKeyDef[]): ColumnDef | null {
    const nameToken = cur.next();
    if (!nameToken || (nameToken.kind !== "word" && nameToken.kind !== "ident")) return null;

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
    let constraintName: string | null = null;
    if (cur.acceptWords("CONSTRAINT")) {
      if (!cur.isWord("PRIMARY") && !cur.isWord("UNIQUE") && !cur.isWord("FOREIGN") && !cur.isWord("CHECK")) {
        constraintName = cur.readName();
      }
    }

    if (cur.acceptWords("PRIMARY", "KEY")) {
      while (!cur.done && !cur.isPunct("(")) cur.next();
      const columns = cur.readNameList();
      if (columns.length) table.primaryKey = columns;
      return;
    }

    if (cur.acceptWords("UNIQUE")) {
      if (!cur.acceptWords("KEY")) cur.acceptWords("INDEX");
      const indexName = cur.isPunct("(") || cur.isWord("USING") ? constraintName : cur.readName();
      while (!cur.done && !cur.isPunct("(")) cur.next();
      const columns = cur.readNameList();
      if (columns.length === 1) {
        const column = this.getColumn(table, columns[0]);
        if (column) column.unique = true;
      } else if (columns.length > 1) {
        table.indexes.push({ name: indexName, columns, unique: true });
      }
      return;
    }

    if (cur.acceptWords("FULLTEXT") || cur.acceptWords("SPATIAL") || cur.isWord("KEY") || cur.isWord("INDEX")) {
      if (!cur.acceptWords("KEY")) cur.acceptWords("INDEX");
      const indexName = cur.isPunct("(") || cur.isWord("USING") ? null : cur.readName();
      while (!cur.done && !cur.isPunct("(")) cur.next();
      const columns = cur.readNameList();
      if (columns.length) table.indexes.push({ name: indexName, columns, unique: false });
      return;
    }

    if (cur.acceptWords("FOREIGN", "KEY")) {
      while (!cur.done && !cur.isPunct("(")) cur.next();
      const columns = cur.readNameList();
      if (!cur.acceptWords("REFERENCES")) return;
      const refTable = cur.readName();
      if (columns.length && refTable) fks.push({ table: table.name, columns, refTable });
    }
  }

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

const newId = () => globalThis.crypto.randomUUID();

const NODE_WIDTH = 300;
const COLUMN_GAP = 140;
const ROW_GAP = 80;

function estimateHeight(rowCount: number): number {
  return 90 + Math.max(rowCount, 1) * 32;
}

type LayoutItem = { key: string; height: number };

function layoutItems(
  items: LayoutItem[],
  dependencies: Map<string, Set<string>>,
): Map<string, { x: number; y: number }> {
  const level = new Map<string, number>();
  const visiting = new Set<string>();

  const computeLevel = (key: string): number => {
    if (level.has(key)) return level.get(key)!;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    let value = 0;
    for (const dep of dependencies.get(key) ?? []) {
      if (dep !== key) value = Math.max(value, computeLevel(dep) + 1);
    }
    visiting.delete(key);
    level.set(key, value);
    return value;
  };

  items.forEach((item) => computeLevel(item.key));

  const maxPerColumn = Math.max(3, Math.ceil(Math.sqrt(items.length)));
  const byLevel = new Map<number, LayoutItem[]>();
  for (const item of items) {
    const lvl = level.get(item.key) ?? 0;
    byLevel.set(lvl, [...(byLevel.get(lvl) ?? []), item]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let columnIndex = 0;

  for (const lvl of [...byLevel.keys()].sort((a, b) => a - b)) {
    const group = byLevel.get(lvl)!;
    for (let start = 0; start < group.length; start += maxPerColumn) {
      let y = 0;
      for (const item of group.slice(start, start + maxPerColumn)) {
        positions.set(item.key, {
          x: columnIndex * (NODE_WIDTH + COLUMN_GAP),
          y,
        });
        y += item.height + ROW_GAP;
      }
      columnIndex++;
    }
  }

  return positions;
}

export function parseSqlToDiagram(sql: string): SqlImportResult {
  const builder = new SchemaBuilder();

  for (const statement of tokenize(sql)) {
    try {
      builder.handleStatement(statement, sql);
    } catch {
      const preview = statement.slice(0, 6).map((t) => t.value).join(" ");
      builder.warnings.push(`Não foi possível interpretar o comando "${preview}...".`);
    }
  }

  const tables = builder.allTables;
  const views = builder.allViews;
  if (!tables.length && !views.length) {
    throw new SqlImportError("Nenhum CREATE TABLE ou CREATE VIEW foi encontrado no arquivo SQL.");
  }

  const warnings = [...builder.warnings];

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

  const tableKey = (name: string) => `t:${name.toLowerCase()}`;
  const viewKey = (name: string) => `v:${name.toLowerCase()}`;
  const dependencies = new Map<string, Set<string>>();
  const addDependency = (from: string, to: string) => {
    if (!dependencies.has(from)) dependencies.set(from, new Set());
    dependencies.get(from)!.add(to);
  };
  for (const fk of fks) addDependency(tableKey(fk.table), tableKey(fk.refTable));

  const viewAnalyses = views.map((view) => analyzeViewSql(view.sql));
  views.forEach((view, index) => {
    for (const source of viewAnalyses[index].tables) {
      if (builder.getTable(source)) addDependency(viewKey(view.name), tableKey(source));
      else if (views.some((v) => v.name.toLowerCase() === source.toLowerCase())) {
        addDependency(viewKey(view.name), viewKey(source));
      }
    }
  });

  const positions = layoutItems(
    [
      ...tables.map((table) => ({
        key: tableKey(table.name),
        height: estimateHeight(table.columns.length + table.indexes.length),
      })),
      ...views.map((view, index) => ({
        key: viewKey(view.name),
        height: estimateHeight(viewAnalyses[index].columns.length),
      })),
    ],
    dependencies,
  );
  let indexCount = 0;

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

    const fieldIdByName = new Map(fields.map((f) => [(f.name ?? "").toLowerCase(), f.id]));
    const indexes: TableIndex[] = [];
    for (const index of table.indexes) {
      const columnNames = index.columns.filter((c) => fieldIdByName.has(c.toLowerCase()));
      if (columnNames.length !== index.columns.length || !columnNames.length) {
        warnings.push(
          `O índice "${index.name ?? index.columns.join(", ")}" da tabela "${table.name}" ` +
            "usa expressões ou colunas desconhecidas e foi ignorado.",
        );
        continue;
      }
      indexes.push({
        id: newId(),
        name: index.name ?? defaultIndexName(table.name, columnNames),
        columns: columnNames.map((c) => fieldIdByName.get(c.toLowerCase())!),
        unique: index.unique,
      });
    }
    indexCount += indexes.length;

    return {
      id,
      type: "entityNode",
      position: positions.get(tableKey(table.name)) ?? { x: 0, y: 0 },
      data: indexes.length ? { name: table.name, fields, indexes } : { name: table.name, fields },
    } as CustomNode;
  });

  const viewNodes: CustomNode[] = views.map(
    (view) =>
      ({
        id: newId(),
        type: "viewNode",
        position: positions.get(viewKey(view.name)) ?? { x: 0, y: 0 },
        data: { name: view.name, sql: view.sql },
      }) as CustomNode,
  );

  const edges: CustomEdge[] = [];
  let relationCount = 0;

  for (const junctionKey of junctionKeys) {
    const junction = builder.getTable(junctionKey)!;
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

  return {
    nodes: [...nodes, ...viewNodes],
    edges,
    warnings,
    tableCount: nodes.length,
    relationCount,
    viewCount: viewNodes.length,
    indexCount,
  };
}
