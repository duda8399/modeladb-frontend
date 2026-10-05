import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createUser, failOnPageErrors } from "./support";

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
});
