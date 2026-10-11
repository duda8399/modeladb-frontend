import { newDb } from "pg-mem";
import { Parser } from "node-sql-parser";
import { generateSqlBlocks, type SqlDialect } from "../utils/sqlExport";
import type { CustomEdge, CustomNode } from "../types/diagramER";

/** Apenas os comandos de DDL (sem CREATE DATABASE/USE), na ordem de execução. */
export function ddlStatements(nodes: CustomNode[], edges: CustomEdge[], dialect: SqlDialect) {
  const { blocks, foreignKeyStatements, indexStatements, viewBlocks } = generateSqlBlocks(nodes, edges, dialect);
  return [...blocks.map((b) => b.sql), ...foreignKeyStatements, ...indexStatements, ...viewBlocks.map((b) => b.sql)];
}

/** Executa o DDL PostgreSQL num banco PostgreSQL emulado em memória (pg-mem). */
export function runOnPgMem(nodes: CustomNode[], edges: CustomEdge[]) {
  const db = newDb();
  ddlStatements(nodes, edges, "postgres").forEach((sql) => db.public.none(sql));
  return db;
}

const parser = new Parser();

/** Analisa cada comando com a gramática do dialeto; lança erro se for inválido. */
export function parseAll(nodes: CustomNode[], edges: CustomEdge[], dialect: SqlDialect) {
  const database = dialect === "mysql" ? "MySQL" : "PostgresQL";
  return ddlStatements(nodes, edges, dialect).map((sql) => parser.astify(sql, { database }));
}
