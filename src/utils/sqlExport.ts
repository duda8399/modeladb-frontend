import type { CustomEdge, CustomNode, Field, TableIndex } from "../types/diagramER";

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

function formatMySqlType(type: string): string {
  const upperType = type.toUpperCase();
  if (upperType === "VARCHAR") return "VARCHAR(255)";
  if (upperType === "CHAR") return "CHAR(1)";
  return upperType;
}

function formatPostgresType(type: string, ai: boolean): string {
  const upperType = type.toUpperCase();
  if (ai && PG_SERIAL_MAP[upperType]) return PG_SERIAL_MAP[upperType];
  return PG_TYPE_MAP[upperType] || upperType;
}

function buildColumnLine(field: Field, dialect: SqlDialect): string {
  const typeSql =
    dialect === "mysql"
      ? formatMySqlType(field.type as string)
      : formatPostgresType(field.type as string, field.ai);

  const parts = [quote(field.name as string, dialect), typeSql];

  if (field.notNull || field.pk) parts.push("NOT NULL");
  if (field.unique && !field.pk) parts.push("UNIQUE");
  if (dialect === "mysql" && field.ai) parts.push("AUTO_INCREMENT");

  return parts.join(" ");
}

function getValidFields(node: CustomNode): Field[] {
  const fields = ((node.data as any)?.fields || []) as Field[];
  return fields.filter((field) => field.name && field.type);
}

function getTableName(node: CustomNode): string {
  return (node.data as any)?.name || "tabela_sem_nome";
}

function findPkColumn(node?: CustomNode): string {
  if (!node) return "id";
  const fields = getValidFields(node);
  return fields.find((field) => field.pk)?.name || "id";
}

function buildCreateTable(node: CustomNode, dialect: SqlDialect): string | null {
  const fields = getValidFields(node);
  if (fields.length === 0) return null;

  const lines = fields.map((field) => `  ${buildColumnLine(field, dialect)}`);

  const pkFields = fields.filter((field) => field.pk);
  if (pkFields.length) {
    const pkColumns = pkFields
      .map((field) => quote(field.name as string, dialect))
      .join(", ");
    lines.push(`  PRIMARY KEY (${pkColumns})`);
  }

  return `CREATE TABLE ${quote(getTableName(node), dialect)} (\n${lines.join(",\n")}\n);`;
}

type ForeignKey = {
  tableNodeId: string;
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
};

function resolveForeignKeys(
  entityNodes: CustomNode[],
  edges: CustomEdge[],
): ForeignKey[] {
  const findNode = (id?: string) => entityNodes.find((node) => node.id === id);
  const processedJunctions = new Set<string>();
  const foreignKeys: ForeignKey[] = [];

  for (const edge of edges) {
    const data = edge.data;
    if (!data) continue;

    if (data.junctionId) {
      if (processedJunctions.has(data.junctionId)) continue;
      processedJunctions.add(data.junctionId);

      const junctionNode = findNode(data.junctionId);
      const sourceNode = findNode(data.sourceNodeId);
      const targetNode = findNode(data.targetNodeId);
      if (!junctionNode || !sourceNode || !targetNode) continue;

      const fkFields = getValidFields(junctionNode).filter((field) => field.fk);
      const sourceFieldName = `fk_${getTableName(sourceNode)}_id`.toLowerCase();
      const targetFieldName = `fk_${getTableName(targetNode)}_id`.toLowerCase();

      let sourceField = fkFields.find(
        (field) => field.name?.toLowerCase() === sourceFieldName,
      );
      let targetField = fkFields.find(
        (field) => field.name?.toLowerCase() === targetFieldName,
      );

      if (!sourceField) sourceField = fkFields[0];
      if (!targetField) targetField = fkFields.find((f) => f !== sourceField);

      if (sourceField) {
        foreignKeys.push({
          tableNodeId: junctionNode.id,
          table: getTableName(junctionNode),
          column: sourceField.name as string,
          refTable: getTableName(sourceNode),
          refColumn: findPkColumn(sourceNode),
        });
      }

      if (targetField) {
        foreignKeys.push({
          tableNodeId: junctionNode.id,
          table: getTableName(junctionNode),
          column: targetField.name as string,
          refTable: getTableName(targetNode),
          refColumn: findPkColumn(targetNode),
        });
      }
    } else if (data.fkFieldName) {
      const sourceNode = findNode(data.sourceNodeId) || findNode(edge.source);
      const targetNode = findNode(data.targetNodeId) || findNode(edge.target);
      if (!sourceNode || !targetNode) continue;

      foreignKeys.push({
        tableNodeId: targetNode.id,
        table: getTableName(targetNode),
        column: data.fkFieldName,
        refTable: getTableName(sourceNode),
        refColumn: findPkColumn(sourceNode),
      });
    }
  }

  const seen = new Set<string>();
  return foreignKeys.filter((fk) => {
    const key = `${fk.table}.${fk.column}`;
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

function buildIndexStatements(node: CustomNode, dialect: SqlDialect): string[] {
  const indexes = ((node.data as { indexes?: TableIndex[] })?.indexes || []) as TableIndex[];
  const fieldsById = new Map(getValidFields(node).map((field) => [field.id, field]));
  const table = getTableName(node);

  return indexes.flatMap((index) => {
    const columns = index.columns
      .map((fieldId) => fieldsById.get(fieldId)?.name)
      .filter((name): name is string => !!name);
    if (!columns.length) return [];

    const name = index.name?.trim() || defaultIndexName(table, columns);
    const columnList = columns.map((column) => quote(column, dialect)).join(", ");
    return [
      `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quote(name, dialect)} ` +
        `ON ${quote(table, dialect)} (${columnList});`,
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
    `REFERENCES ${quote(fk.refTable, dialect)}(${quote(fk.refColumn, dialect)});`
  );
}

export function generateSqlBlocks(
  nodes: CustomNode[],
  edges: CustomEdge[],
  dialect: SqlDialect,
  databaseName?: string,
): SqlBlocksResult {
  const entityNodes = nodes.filter((node) => node.type === "entityNode");
  const foreignKeys = resolveForeignKeys(entityNodes, edges);

  let skippedFields = 0;
  const blocks: SqlBlock[] = [];

  for (const node of entityNodes) {
    const allFields = ((node.data as any)?.fields || []) as Field[];
    skippedFields += allFields.length - getValidFields(node).length;

    const createStatement = buildCreateTable(node, dialect);
    if (!createStatement) continue;

    blocks.push({
      key: node.id,
      title: getTableName(node),
      sql: createStatement,
    });
  }

  // As tabelas referenciadas por uma FK só existem depois que todos os
  // CREATE TABLE forem executados, então as constraints são emitidas à parte.
  const foreignKeyStatements = foreignKeys.map((fk) => buildFkStatement(fk, dialect));

  const indexStatements = entityNodes.flatMap((node) => buildIndexStatements(node, dialect));

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
