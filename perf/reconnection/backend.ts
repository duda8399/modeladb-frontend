import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

export const BACKEND_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../modeladb-backend");

const TS_NODE = resolve(BACKEND_ROOT, "node_modules/ts-node/dist/bin.js");

type Ready = { child: ChildProcess; line: string; readyAt: number };

function spawnUntil(script: string, marker: string, env: NodeJS.ProcessEnv, timeoutMs = 90_000): Promise<Ready> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [TS_NODE, "--transpile-only", "-r", "tsconfig-paths/register", script],
      { cwd: BACKEND_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] },
    );

    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${script} não ficou pronto em ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const line = buffer.split("\n").find((l) => l.includes(marker));
      if (!line || settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ child, line: line.trim(), readyAt: performance.now() });
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${script} saiu antes de ficar pronto (código ${code}, sinal ${signal})`));
    });
  });
}

function stop(child: ChildProcess, signal: NodeJS.Signals) {
  return new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("exit", () => resolvePromise());
    child.kill(signal);
  });
}

export class Backend {
  private db: ChildProcess | null = null;
  private server: ChildProcess | null = null;
  private dbUri = "";
  readonly port: number;

  constructor(port: number) {
    this.port = port;
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    const db = await spawnUntil("test/support/memory-db-server.ts", "MODELADB_MEMORY_DB_READY", {
      MEMORY_DB_NAME: "modeladb_reconnection",
    });
    this.db = db.child;
    this.dbUri = db.line.split(" ").pop()!;
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(this.dbUri)) {
      throw new Error("o banco do experimento precisa ser local");
    }
    return this.startServer();
  }

  async startServer() {
    const started = performance.now();
    const server = await spawnUntil("test/support/test-server.ts", "MODELADB_TEST_SERVER_READY", {
      PORT: String(this.port),
      TEST_SERVER_DB_URI: this.dbUri,
      FRONT_URL: "http://localhost:5174",
    });
    this.server = server.child;
    return { readyAt: server.readyAt, bootMs: server.readyAt - started };
  }

  async killServer() {
    if (!this.server) return;
    await stop(this.server, "SIGKILL");
    this.server = null;
  }

  async stop() {
    if (this.server) await stop(this.server, "SIGTERM");
    if (this.db) await stop(this.db, "SIGTERM");
    this.server = null;
    this.db = null;
  }
}

export type User = { id: string; email: string; password: string; token: string };

export async function request<T>(baseUrl: string, method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function registerUser(baseUrl: string, label: string): Promise<User> {
  const email = `reconexao-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exp.modeladb`;
  const password = "senha-experimento-123";
  await request(baseUrl, "POST", "/auth/register", { name: `Exp ${label}`, email, password });
  return login(baseUrl, { id: "", email, password, token: "" });
}

export async function login(baseUrl: string, user: User): Promise<User> {
  const res = await request<{ userId: string; accessToken: string }>(baseUrl, "POST", "/auth/login", {
    email: user.email,
    password: user.password,
  });
  return { ...user, id: res.userId, token: res.accessToken };
}
