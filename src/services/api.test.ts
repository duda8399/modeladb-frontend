import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeJwt(payload: object) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.assinatura`;
}

const valid = (sub: string) => fakeJwt({ sub, exp: Date.now() / 1000 + 900 });
const expired = (sub: string) => fakeJwt({ sub, exp: Date.now() / 1000 - 10 });

type Route = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

let storage: Record<string, string>;
let assign: ReturnType<typeof vi.fn>;
let calls: { url: string; auth?: string; body?: unknown }[];
let routes: Record<string, Route>;

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { status, data, statusText: "", headers: {}, config } as AxiosResponse;

  if (status >= 400) {
    return Promise.reject(new AxiosError("erro", String(status), config, null, response));
  }

  return Promise.resolve(response);
}

async function loadApi() {
  vi.resetModules();
  return import("./api");
}

describe("api: sessão e refresh token", () => {
  const originalAdapter = axios.defaults.adapter;

  beforeEach(() => {
    storage = {};
    calls = [];
    routes = {};
    assign = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => (storage[k] = v),
      removeItem: (k: string) => delete storage[k],
    });
    vi.stubGlobal("window", { location: { pathname: "/documents", assign } });
    axios.defaults.adapter = (config) => {
      const url = (config.url ?? "").replace(/^\/+/, "");
      const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      calls.push({ url, auth: config.headers?.Authorization as string | undefined, body });
      const route = routes[url];
      const { status, data } = route ? route(config) : { status: 404 };
      return respond(config, status, data);
    };
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });

  it("anexa o access token válido sem chamar o refresh", async () => {
    storage.accessToken = valid("a1");
    storage.refreshToken = "r1";
    routes["diagram/my-documents"] = () => ({ status: 200, data: [] });

    const { api } = await loadApi();
    await api.get("/diagram/my-documents");

    expect(calls.map((c) => c.url)).toEqual(["diagram/my-documents"]);
    expect(calls[0].auth).toBe(`Bearer ${storage.accessToken}`);
  });

  it("renova o access token expirado antes de enviar a requisição", async () => {
    storage.accessToken = expired("a1");
    storage.refreshToken = "r1";
    const fresh = valid("a2");
    routes["auth/refresh"] = () => ({ status: 201, data: { accessToken: fresh, refreshToken: "r2" } });
    routes["diagram/my-documents"] = () => ({ status: 200, data: [] });

    const { api } = await loadApi();
    await api.get("/diagram/my-documents");

    expect(calls.map((c) => c.url)).toEqual(["auth/refresh", "diagram/my-documents"]);
    expect(calls[0].body).toEqual({ refreshToken: "r1" });
    expect(calls[1].auth).toBe(`Bearer ${fresh}`);
    expect(storage.refreshToken).toBe("r2");
  });

  it("um 401 dispara o refresh e repete a requisição uma única vez", async () => {
    storage.accessToken = valid("a1");
    storage.refreshToken = "r1";
    const fresh = valid("a2");
    routes["auth/refresh"] = () => ({ status: 201, data: { accessToken: fresh, refreshToken: "r2" } });
    routes["diagram/my-documents"] = (config) =>
      config.headers?.Authorization === `Bearer ${fresh}` ? { status: 200, data: ["ok"] } : { status: 401 };

    const { api } = await loadApi();
    const { data } = await api.get("/diagram/my-documents");

    expect(data).toEqual(["ok"]);
    expect(calls.map((c) => c.url)).toEqual(["diagram/my-documents", "auth/refresh", "diagram/my-documents"]);
  });

  it("refresh recusado encerra a sessão e leva ao login", async () => {
    storage.accessToken = expired("a1");
    storage.refreshToken = "r1";
    storage.userId = "u1";
    routes["auth/refresh"] = () => ({ status: 401 });
    routes["diagram/my-documents"] = () => ({ status: 401 });

    const { api } = await loadApi();
    await expect(api.get("/diagram/my-documents")).rejects.toBeTruthy();

    expect(storage.accessToken).toBeUndefined();
    expect(storage.refreshToken).toBeUndefined();
    expect(storage.userId).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("requisições simultâneas compartilham um único refresh", async () => {
    storage.accessToken = expired("a1");
    storage.refreshToken = "r1";
    routes["auth/refresh"] = () => ({ status: 201, data: { accessToken: valid("a2"), refreshToken: "r2" } });
    routes["diagram/my-documents"] = () => ({ status: 200, data: [] });
    routes["diagram/recent"] = () => ({ status: 200, data: [] });

    const { api } = await loadApi();
    await Promise.all([api.get("/diagram/my-documents"), api.get("/diagram/recent")]);

    expect(calls.filter((c) => c.url === "auth/refresh")).toHaveLength(1);
  });

  it("usa o token renovado por outra aba quando o refresh falha por rotação", async () => {
    storage.accessToken = expired("a1");
    storage.refreshToken = "r1";
    const fromOtherTab = valid("a2");
    routes["auth/refresh"] = () => {
      storage.accessToken = fromOtherTab;
      storage.refreshToken = "r2";
      return { status: 401 };
    };
    routes["diagram/my-documents"] = () => ({ status: 200, data: [] });

    const { api } = await loadApi();
    await api.get("/diagram/my-documents");

    expect(calls.at(-1)?.auth).toBe(`Bearer ${fromOtherTab}`);
    expect(assign).not.toHaveBeenCalled();
  });

  it("não mexe no cabeçalho das rotas de autenticação", async () => {
    storage.accessToken = expired("a1");
    storage.refreshToken = "r1";
    routes["auth/reset-password"] = () => ({ status: 201, data: {} });

    const { api } = await loadApi();
    await api.post("/auth/reset-password", { password: "x" }, { headers: { Authorization: "Bearer reset" } });

    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe("Bearer reset");
  });
});
