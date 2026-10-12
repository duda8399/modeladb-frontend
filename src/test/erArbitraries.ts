import fc from "fast-check";
import type { CustomEdge } from "../types/diagramER";
import { col, manyToMany, oneToMany, pk, table } from "./erFixtures";

/**
 * Gerador de diagramas ER aleatórios para testes baseados em propriedades:
 * tabelas e colunas com nomes "humanos" (acentos, espaços, símbolos), tipos
 * sorteados e relacionamentos 1:1, 1:N e N:N.
 */

/** Os 32 tipos oferecidos no modal de atributos (AttributesModal). */
export const ALL_UI_TYPES = [
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
  "CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET",
  "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "BOOLEAN", "JSON", "GEOMETRY", "POINT",
];

// pg-mem não implementa o tipo BIT; ele é coberto pelo teste com bancos reais.
export const PG_MEM_TYPES = [
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
  "CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "ENUM", "SET",
  "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "BOOLEAN", "JSON", "GEOMETRY", "POINT",
];

// Nomes com letras acentuadas, espaços e símbolos, como um usuário digitaria.
const rawName = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzáéíóúãõçÀÉ _-#$1234567890"), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

const sanitize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_]/g, "_");

const freeText = fc
  .array(fc.constantFrom(..."abcçãé XYZ'%_-.,0123"), { minLength: 0, maxLength: 10 })
  .map((chars) => chars.join(""));

const uniqueNames = (min: number, max: number) =>
  fc.uniqueArray(rawName, { minLength: min, maxLength: max, selector: (n) => sanitize(n).toLowerCase() });

/**
 * Tipos que podem receber UNIQUE/PRIMARY KEY tanto no MySQL 8.4 quanto no
 * PostgreSQL 16 (ver a matriz de compatibilidade em sqlExport.engines.test).
 */
export const KEYABLE_TYPES = [
  "TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "BIT",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR", "CHAR", "VARCHAR", "BINARY", "BOOLEAN",
];

export const diagramArb = (types: string[], keyableTypes: string[] = types) =>
  fc
  .record({
    tableNames: uniqueNames(1, 6),
    columns: fc.array(
      fc.record({
        names: uniqueNames(1, 6),
        types: fc.array(fc.constantFrom(...types), { minLength: 6, maxLength: 6 }),
        notNull: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        unique: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        values: fc.array(fc.array(freeText, { maxLength: 4 }), { minLength: 6, maxLength: 6 }),
        descriptions: fc.array(freeText, { minLength: 6, maxLength: 6 }),
      }),
      { minLength: 6, maxLength: 6 },
    ),
    tableDescriptions: fc.array(freeText, { minLength: 6, maxLength: 6 }),
    relations: fc.array(
      fc.record({ from: fc.nat(), to: fc.nat(), kind: fc.constantFrom("1:N", "1:1", "N:N") }),
      { maxLength: 5 },
    ),
  })
  .map(({ tableNames, columns, tableDescriptions, relations }) => {
    const tables = tableNames.map((name, i) => {
      const spec = columns[i];
      const fields = [
        pk("id"),
        ...spec.names
          .filter((n) => sanitize(n).toLowerCase() !== "id" && !sanitize(n).toLowerCase().startsWith("fk_"))
          .map((n, j) => col(n, spec.types[j], {
            notNull: spec.notNull[j],
            unique: spec.unique[j] && keyableTypes.includes(spec.types[j]),
            ...(spec.types[j] === "ENUM" || spec.types[j] === "SET" ? { values: spec.values[j] } : {}),
            ...(spec.descriptions[j].trim() ? { description: spec.descriptions[j].trim() } : {}),
          })),
      ];
      const node = table(name, fields);
      if (tableDescriptions[i].trim()) (node.data as { description?: string }).description = tableDescriptions[i].trim();
      return node;
    });

    const nodes = [...tables];
    const edges: CustomEdge[] = [];
    const used = new Set<string>();

    for (const r of relations) {
      const a = tables[r.from % tables.length];
      const b = tables[r.to % tables.length];
      const key = [a.id, b.id].sort().join("|");
      if (a === b || used.has(key)) continue;
      used.add(key);

      if (r.kind === "N:N") {
        const { junction, edges: junctionEdges } = manyToMany(a, b);
        const junctionName = sanitize((junction.data as { name: string }).name).toLowerCase();
        if (nodes.some((n) => sanitize((n.data as { name: string }).name).toLowerCase() === junctionName)) continue;
        nodes.push(junction);
        edges.push(...junctionEdges);
      } else {
        const fkName = `fk_${(a.data as { name: string }).name}_id`;
        const targetCols = (b.data as { fields: { name: string | null }[] }).fields;
        if (targetCols.some((f) => sanitize(f.name ?? "").toLowerCase() === sanitize(fkName).toLowerCase())) continue;
        edges.push(oneToMany(a, b, r.kind as "1:N" | "1:1"));
      }
    }

    return { nodes, edges };
  });

