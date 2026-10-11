import { expect, request, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { BACKEND_URL, createUser, failOnPageErrors } from "./support";

test.describe("Autenticação pela interface", () => {
  test("cadastro → login → página inicial", async ({ page }) => {
    const assertNoErrors = failOnPageErrors(page);
    const email = `cadastro-${randomUUID().slice(0, 8)}@e2e.modeladb`;

    await page.goto("/register");
    await page.getByPlaceholder("Seu nome completo").fill("Maria E2E");
    await page.getByPlaceholder("Endereço de e-mail").fill(email);
    await page.getByPlaceholder("Crie uma senha").fill("senha-e2e-123");
    await page.getByPlaceholder("Confirme sua senha").fill("senha-e2e-123");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByText("Conta criada com sucesso!")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder("Endereço de e-mail").fill(email);
    await page.getByPlaceholder("Senha").fill("senha-e2e-123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Documentos recentes")).toBeVisible();
    assertNoErrors();
  });

  test("senha incorreta mantém o usuário na tela de login", async ({ page }) => {
    const user = await createUser("senha-errada");

    await page.goto("/login");
    await page.getByPlaceholder("Endereço de e-mail").fill(user.email);
    await page.getByPlaceholder("Senha").fill("senha-incorreta");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator(".ant-message")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rotas privadas redirecionam para o login sem sessão", async ({ page }) => {
    await page.goto("/documents");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("senhas diferentes na confirmação bloqueiam o cadastro", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("Seu nome completo").fill("X");
    await page.getByPlaceholder("Endereço de e-mail").fill("x@e2e.modeladb");
    await page.getByPlaceholder("Crie uma senha").fill("senha-123");
    await page.getByPlaceholder("Confirme sua senha").fill("outra-456");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.locator(".ant-form-item-explain-error")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("um access token expirado é renovado pelo refresh token sem pedir login", async ({ browser }) => {
    const user = await createUser("sessao");
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const expired = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 60 })}.x`;

    const context = await browser.newContext();
    await context.addInitScript(
      ([access, refresh, userId]) => {
        if (localStorage.getItem("refreshToken")) return;
        localStorage.setItem("accessToken", access);
        localStorage.setItem("refreshToken", refresh);
        localStorage.setItem("userId", userId);
      },
      [expired, user.refreshToken, user.id],
    );
    const page = await context.newPage();
    const assertNoErrors = failOnPageErrors(page);

    await page.goto("/documents");

    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByText("Meus documentos").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("accessToken"))).not.toBe(expired);
    expect(await page.evaluate(() => localStorage.getItem("refreshToken"))).not.toBe(user.refreshToken);
    assertNoErrors();
  });

  test("um refresh token revogado leva ao login", async ({ browser }) => {
    const user = await createUser("revogado");
    const api = await request.newContext({ baseURL: BACKEND_URL });
    expect((await api.post("/auth/logout", { data: { refreshToken: user.refreshToken } })).ok()).toBe(true);
    await api.dispose();

    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const expired = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 60 })}.x`;

    const context = await browser.newContext();
    await context.addInitScript(
      ([access, refresh, userId]) => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("accessToken", access);
        localStorage.setItem("refreshToken", refresh);
        localStorage.setItem("userId", userId);
      },
      [expired, user.refreshToken, user.id],
    );
    const page = await context.newPage();

    await page.goto("/documents");

    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem("refreshToken"))).toBeNull();
  });

  test("esqueci a senha responde igual para e-mails cadastrados ou não", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByPlaceholder("Endereço de e-mail").fill(`ninguem-${randomUUID().slice(0, 8)}@e2e.modeladb`);
    await page.getByRole("button", { name: /enviar|recuperar/i }).click();

    await expect(page.getByText("Se o e-mail estiver cadastrado")).toBeVisible();
  });
});
