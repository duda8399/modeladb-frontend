import type {
  CustomEdge,
  CustomNode,
  Field,
  FkAction,
  TableCheck,
  TableIndex,
} from "../types/diagramER";
import { isValidSize, isValueListType, normalizeSize, normalizeValues } from "./sqlTypes";
import { resolveDirectFkLinks, resolveJunctionFkLinks } from "./foreignKeys";

export type SqlDialect = "mysql" | "postgres";

const PG_TYPE_MAP: Record<string, string> = {
  TINYINT: "SMALLINT",
  SMALLINT: "SMALLINT",
  MEDIUMINT: "INTEGER",
  INT: "INTEGER",
  BIGINT: "BIGINT",
  DECIMAL: "DECIMAL",
  FLOAT: "REAL",
  DOUBLE: "DOUBLE PRECISION",
  BIT: "BIT",
  DATE: "DATE",
  DATETIME: "TIMESTAMP",
  TIMESTAMP: "TIMESTAMP",
  TIME: "TIME",
  YEAR: "SMALLINT",
  CHAR: "CHAR(1)",
  VARCHAR: "VARCHAR(255)",
  TINYTEXT: "TEXT",
  TEXT: "TEXT",
  MEDIUMTEXT: "TEXT",
  LONGTEXT: "TEXT",
  ENUM: "TEXT",
  SET: "TEXT",
  BINARY: "BYTEA",
  VARBINARY: "BYTEA",
  TINYBLOB: "BYTEA",
  BLOB: "BYTEA",
  MEDIUMBLOB: "BYTEA",
  LONGBLOB: "BYTEA",
  BOOLEAN: "BOOLEAN",
  JSON: "JSONB",
  GEOMETRY: "TEXT",
  POINT: "POINT",
};

const PG_SERIAL_MAP: Record<string, string> = {
  TINYINT: "SMALLSERIAL",
  SMALLINT: "SMALLSERIAL",
  MEDIUMINT: "SERIAL",
  INT: "SERIAL",
  BIGINT: "BIGSERIAL",
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sanitizeIdentifier(name: string, fallback = "coluna"): string {
  const sanitized = stripDiacritics(name).replace(/[^a-zA-Z0-9_]/g, "_");
  return sanitized || fallback;
}

function quote(identifier: string, dialect: SqlDialect): string {
  const safe = sanitizeIdentifier(identifier);
  return dialect === "mysql" ? `\`${safe}\`` : `"${safe}"`;
}

function sanitizeConstraintName(name: string): string {
  return sanitizeIdentifier(name, "fk");
}

function sanitizeDatabaseName(name: string): string {
  return sanitizeIdentifier(name.trim(), "modeladb");
}

function validSize(field: Field): string | null {
  const size = normalizeSize(field.size);
  return size && isValidSize(field.type, size) ? size : null;
}

function sqlString(value: string, dialect: SqlDialect): string {
  const escaped = dialect === "mysql" ? value.replace(/\\/g, "\\\\") : value;
  return `'${escaped.replace(/'/g, "''")}'`;
}

function formatMySqlType(type: string, size: string | null = null, values: string[] = []): string {
  const upperType = type.toUpperCase();
  if (isValueListType(upperType)) {
    return values.length
      ? `${upperType}(${values.map((value) => sqlString(value, "mysql")).join(", ")})`
      : "VARCHAR(255)";
  }
  if (size) return `${upperType}(${size})`;
  if (upperType === "VARCHAR" || upperType === "VARBINARY") return `${upperType}(255)`;
  if (upperType === "CHAR") return "CHAR(1)";
  return upperType;
}

const PG_SIZED_NAMES: Record<string, string> = {
  CHAR: "CHAR",
  VARCHAR: "VARCHAR",
  DECIMAL: "DECIMAL",
  BIT: "BIT",
  DATETIME: "TIMESTAMP",
  TIMESTAMP: "TIMESTAMP",
  TIME: "TIME",
};

function formatPostgresType(type: string, ai: boolean, size: string | null = null): string {
  const upperType = type.toUpperCase();
  if (ai && PG_SERIAL_MAP[upperType]) return PG_SERIAL_MAP[upperType];
  if (size && PG_SIZED_NAMES[upperType]) return `${PG_SIZED_NAMES[upperType]}(${size})`;
  return PG_TYPE_MAP[upperType] || upperType;
}

function descriptionOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildColumnLine(field: Field, columnName: string, dialect: SqlDialect): string {
  const size = validSize(field);
  const values = isValueListType(field.type) ? normalizeValues(field.values, field.type) : [];
  const typeSql =
    dialect === "mysql"
      ? formatMySqlType(field.type as string, size, values)
      : formatPostgresType(field.type as string, field.ai, size);

  const column = quote(columnName, dialect);
  const parts = [column, typeSql];

  const defaultValue = field.defaultValue?.trim();
  if (defaultValue && !field.ai) parts.push(`DEFAULT ${defaultValue}`);

  if (field.notNull || field.pk) parts.push("NOT NULL");
  if (field.unique && !field.pk) parts.push("UNIQUE");
  if (dialect === "mysql" && field.ai) parts.push("AUTO_INCREMENT");

  if (dialect === "postgres" && field.type?.toUpperCase() === "ENUM" && values.length) {
    parts.push(`CHECK (${column} IN (${values.map((value) => sqlString(value, dialect)).join(", ")}))`);
  }

  const description = descriptionOf(field.description);
  if (dialect === "mysql" && description) parts.push(`COMMENT ${sqlString(description, dialect)}`);

  return parts.join(" ");
}

function getValidFields(node: CustomNode): Field[] {
  const fields = ((node.data as any)?.fields || []) as Field[];
  return fields.filter((field) => field.name && field.type);
}

function getTableName(node: CustomNode): string {
  return (node.data as any)?.name || "tabela_sem_nome";
}

type TableModel = {
  node: CustomNode;
  name: string;
  fields: Field[];
  columnNames: Map<string, string>;
};

function uniqueName(base: string, used: Set<string>, fallback: string): string {
  const root = sanitizeIdentifier(base, fallback);
  let candidate = root;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${root}_${suffix++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildTableModels(entityNodes: CustomNode[]): Map<string, TableModel> {
  const usedTables = new Set<string>();
  const models = new Map<string, TableModel>();

  for (const node of entityNodes) {
    const fields = getValidFields(node);
    const usedColumns = new Set<string>();
    const columnNames = new Map(
      fields.map((field) => [field.id, uniqueName(field.name as string, usedColumns, "coluna")]),
    );
    models.set(node.id, {
      node,
      name: uniqueName(getTableName(node), usedTables, "tabela"),
      fields,
      columnNames,
    });
  }

  return models;
}

function pkColumnOf(model: TableModel | undefined): string | null {
  const field = model?.fields.find((f) => f.pk);
  return field ? model!.columnNames.get(field.id) ?? null : null;
}

function buildCreateTable(model: TableModel, dialect: SqlDialect): string | null {
  const { fields, columnNames, name, node } = model;
  if (fields.length === 0) return null;

  const columnOf = (field: Field) => columnNames.get(field.id) as string;
  const lines = fields.map((field) => `  ${buildColumnLine(field, columnOf(field), dialect)}`);

  const pkFields = fields.filter((field) => field.pk);
  if (pkFields.length) {
    const pkColumns = pkFields.map((field) => quote(columnOf(field), dialect)).join(", ");
    lines.push(`  PRIMARY KEY (${pkColumns})`);
  }

  getChecks(node).forEach((check, index) => {
    const checkName = check.name?.trim() || defaultCheckName(name, index);
    lines.push(`  CONSTRAINT ${quote(checkName, dialect)} CHECK (${check.expression.trim()})`);
  });

  const table = quote(name, dialect);
  const tableDescription = descriptionOf((node.data as { description?: unknown })?.description);
  const tableOptions =
    dialect === "mysql" && tableDescription ? ` COMMENT=${sqlString(tableDescription, dialect)}` : "";
  const statements = [`CREATE TABLE ${table} (\n${lines.join(",\n")}\n)${tableOptions};`];

  if (dialect === "postgres") {
    if (tableDescription) statements.push(`COMMENT ON TABLE ${table} IS ${sqlString(tableDescription, dialect)};`);
    for (const field of fields) {
      const description = descriptionOf(field.description);
      if (description) {
        statements.push(
          `COMMENT ON COLUMN ${table}.${quote(columnOf(field), dialect)} IS ${sqlString(description, dialect)};`,
        );
      }
    }
  }

  return statements.join("\n");
}

type ForeignKey = {
  tableNodeId: string;
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: FkAction | null;
  onUpdate?: FkAction | null;
};

export function defaultCheckName(table: string, index: number): string {
  return sanitizeIdentifier(`chk_${table}_${index + 1}`, "chk");
}

function getChecks(node: CustomNode): TableCheck[] {
  const checks = ((node.data as { checks?: TableCheck[] })?.checks || []) as TableCheck[];
  return checks.filter((check) => check.expression?.trim());
}

const actionsOf = (edge?: CustomEdge) => ({
  onDelete: edge?.data?.onDelete ?? null,
  onUpdate: edge?.data?.onUpdate ?? null,
});

function resolveForeignKeys(
  entityNodes: CustomNode[],
  edges: CustomEdge[],
  models: Map<string, TableModel>,
): ForeignKey[] {
  const foreignKeys: ForeignKey[] = [];
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

  const push = (childId: string, field: Field | null, parentId: string, edge?: CustomEdge) => {
    const child = models.get(childId);
    const parent = models.get(parentId);
    const column = field ? child?.columnNames.get(field.id) : undefined;
    const refColumn = pkColumnOf(parent);
    if (!child || !parent || !column || !refColumn) return;
    foreignKeys.push({
      tableNodeId: childId,
      table: child.name,
      column,
      refTable: parent.name,
      refColumn,
      ...actionsOf(edge),
    });
  };

  for (const link of resolveJunctionFkLinks(entityNodes, edges)) {
    push(link.junctionId, link.field, link.parentId, edgeById.get(link.edgeId));
  }

  for (const link of resolveDirectFkLinks(entityNodes, edges).values()) {
    push(link.childId, link.field, link.parentId, edgeById.get(link.edgeId));
  }

  const seen = new Set<string>();
  return foreignKeys.filter((fk) => {
    const key = `${fk.table}.${fk.column}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type SqlBlock = {
  key: string;
  title: string;
  sql: string;
};

export type SqlBlocksResult = {
  header: string;
  footer: string;
  blocks: SqlBlock[];
  foreignKeyStatements: string[];
  indexStatements: string[];
  viewBlocks: SqlBlock[];
  skippedFields: number;
  skippedViews: number;
};

export function defaultIndexName(table: string, columns: string[]): string {
  return sanitizeIdentifier(`idx_${table}_${columns.join("_")}`, "idx");
}

function buildIndexStatements(model: TableModel, dialect: SqlDialect): string[] {
  const indexes = ((model.node.data as { indexes?: TableIndex[] })?.indexes || []) as TableIndex[];

  return indexes.flatMap((index) => {
    const columns = index.columns
      .map((fieldId) => model.columnNames.get(fieldId))
      .filter((name): name is string => !!name);
    if (!columns.length) return [];

    const name = index.name?.trim() || defaultIndexName(model.name, columns);
    const columnList = columns.map((column) => quote(column, dialect)).join(", ");
    return [
      `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quote(name, dialect)} ` +
        `ON ${quote(model.name, dialect)} (${columnList});`,
    ];
  });
}

function buildViewStatement(node: CustomNode, dialect: SqlDialect): string | null {
  const data = node.data as { name?: string; sql?: string };
  const query = (data?.sql || "").trim().replace(/;+\s*$/, "").trim();
  if (!query) return null;
  return `CREATE VIEW ${quote(data.name || "view_sem_nome", dialect)} AS\n${query};`;
}

function buildFkStatement(fk: ForeignKey, dialect: SqlDialect): string {
  const constraintName = sanitizeConstraintName(`fk_${fk.table}_${fk.column}`);
  return (
    `ALTER TABLE ${quote(fk.table, dialect)} ` +
    `ADD CONSTRAINT ${quote(constraintName, dialect)} ` +
    `FOREIGN KEY (${quote(fk.column, dialect)}) ` +
    `REFERENCES ${quote(fk.refTable, dialect)}(${quote(fk.refColumn, dialect)})` +
    (fk.onDelete ? ` ON DELETE ${fk.onDelete}` : "") +
    (fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : "") +
    ";"
  );
}

export function generateSqlBlocks(
  nodes: CustomNode[],
  edges: CustomEdge[],
  dialect: SqlDialect,
  databaseName?: string,
): SqlBlocksResult {
  const entityNodes = nodes.filter((node) => node.type === "entityNode");
  const models = buildTableModels(entityNodes);
  const foreignKeys = resolveForeignKeys(entityNodes, edges, models);

  let skippedFields = 0;
  const blocks: SqlBlock[] = [];

  for (const model of models.values()) {
    const allFields = ((model.node.data as any)?.fields || []) as Field[];
    skippedFields += allFields.length - model.fields.length;

    const createStatement = buildCreateTable(model, dialect);
    if (!createStatement) continue;

    blocks.push({
      key: model.node.id,
      title: model.name,
      sql: createStatement,
    });
  }

  const emitted = new Set(blocks.map((block) => block.key));
  const foreignKeyStatements = foreignKeys
    .filter((fk) => emitted.has(fk.tableNodeId))
    .map((fk) => buildFkStatement(fk, dialect));

  const indexStatements = [...models.values()]
    .filter((model) => emitted.has(model.node.id))
    .flatMap((model) => buildIndexStatements(model, dialect));

  let skippedViews = 0;
  const viewBlocks: SqlBlock[] = [];
  for (const node of nodes.filter((n) => n.type === "viewNode")) {
    const statement = buildViewStatement(node, dialect);
    if (!statement) {
      skippedViews++;
      continue;
    }
    viewBlocks.push({ key: node.id, title: (node.data as { name?: string })?.name || "", sql: statement });
  }

  const dbName = sanitizeDatabaseName(databaseName || "modeladb");

  const header =
    dialect === "mysql"
      ? `-- Gerado pelo ModelaDB\nCREATE DATABASE IF NOT EXISTS \`${dbName}\`;\nUSE \`${dbName}\`;\nSET FOREIGN_KEY_CHECKS=0;\n\n`
      : `-- Gerado pelo ModelaDB\n-- O PostgreSQL não permite criar um banco e usá-lo na mesma sessão.\n-- Após criar o banco, conecte-se a ele antes de rodar o restante do script.\n-- Se estiver usando o psql, use o comando: \\c ${dbName}\nCREATE DATABASE "${dbName}";\n\n`;
  const footer = dialect === "mysql" ? "\n\nSET FOREIGN_KEY_CHECKS=1;\n" : "\n";

  return {
    header,
    footer,
    blocks,
    foreignKeyStatements,
    indexStatements,
    viewBlocks,
    skippedFields,
    skippedViews,
  };
}

export function generateSqlScript(
  nodes: CustomNode[],
  edges: CustomEdge[],
  dialect: SqlDialect,
  databaseName?: string,
): { sql: string; skippedFields: number; skippedViews: number } {
  const {
    header,
    footer,
    blocks,
    foreignKeyStatements,
    indexStatements,
    viewBlocks,
    skippedFields,
    skippedViews,
  } = generateSqlBlocks(nodes, edges, dialect, databaseName);

  const sections = [
    blocks.map((block) => block.sql).join("\n\n"),
    ...(foreignKeyStatements.length ? [foreignKeyStatements.join("\n\n")] : []),
    ...(indexStatements.length ? [indexStatements.join("\n")] : []),
    ...(viewBlocks.length ? [viewBlocks.map((block) => block.sql).join("\n\n")] : []),
  ].filter(Boolean);

  const sql = header + sections.join("\n\n") + footer;

  return { sql, skippedFields, skippedViews };
}

export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType = "application/sql",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
