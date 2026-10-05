import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Sobe MySQL 8.4 e PostgreSQL 16 reais em contêineres Docker descartáveis
 * para executar o SQL exportado exatamente como um usuário faria.
 */

const run = (args: string[], input?: string) =>
  execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

export type EngineResult = { ok: true } | { ok: false; error: string };

function attempt(fn: () => void): EngineResult {
  try {
    fn();
    return { ok: true };
  } catch (error) {
    const e = error as { stderr?: string; message: string };
    return { ok: false, error: (e.stderr || e.message).trim() };
  }
}

function waitFor(check: () => void, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      execFileSync("sleep", ["1"]);
    }
  }
}

export function startEngines() {
  const suffix = randomUUID().slice(0, 8);
  const pg = `modeladb-test-pg-${suffix}`;
  const mysql = `modeladb-test-mysql-${suffix}`;

  run(["run", "-d", "--rm", "--name", pg, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
  run(["run", "-d", "--rm", "--name", mysql, "-e", "MYSQL_ROOT_PASSWORD=test", "mysql:8.4"]);

  const psql = (sql: string, db = "postgres") =>
    run(["exec", "-i", pg, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], sql);
  const mysqlExec = (sql: string) =>
    run(["exec", "-i", mysql, "mysql", "-uroot", "-ptest", "--protocol=TCP"], sql);

  waitFor(() => psql("SELECT 1;"), 60_000);
  waitFor(() => mysqlExec("SELECT 1;"), 120_000);

  return {
    /** Roda o script MySQL completo (com CREATE DATABASE/USE), como o usuário. */
    runMySql: (script: string): EngineResult => attempt(() => mysqlExec(script)),

    /**
     * O psql não troca de banco no meio de um script vindo da entrada padrão,
     * então criamos o banco antes e executamos o DDL conectado a ele (que é
     * exatamente o passo a passo descrito no cabeçalho do script gerado).
     */
    runPostgres: (ddl: string): EngineResult => {
      const db = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      return attempt(() => {
        psql(`CREATE DATABASE ${db};`);
        psql(ddl, db);
      });
    },

    stop: () => {
      for (const name of [pg, mysql]) {
        try {
          run(["rm", "-f", name]);
        } catch {
          /* já removido */
        }
      }
    },
  };
}

export type Engines = ReturnType<typeof startEngines>;
