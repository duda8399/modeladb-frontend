import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, getToken, isAuthenticated } from "./auth";

function fakeJwt(payload: object) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.assinatura`;
}

describe("auth (frontend)", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => (storage[k] = v),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sem token: não autenticado e sem usuário atual", () => {
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(getCurrentUser()).toBeNull();
  });

  it("lê id e e-mail do payload do token", () => {
    storage.accessToken = fakeJwt({ sub: "u1", email: "a@x.com", exp: Date.now() / 1000 + 60 });

    expect(getCurrentUser()).toEqual({ id: "u1", email: "a@x.com" });
    expect(isAuthenticated()).toBe(true);
  });

  it("token expirado não conta como autenticado", () => {
    storage.accessToken = fakeJwt({ sub: "u1", exp: Date.now() / 1000 - 1 });

    expect(isAuthenticated()).toBe(false);
  });

  it("token sem exp não conta como autenticado", () => {
    storage.accessToken = fakeJwt({ sub: "u1" });

    expect(isAuthenticated()).toBe(false);
  });

  it("token corrompido não quebra a aplicação", () => {
    storage.accessToken = "lixo";

    expect(getCurrentUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
