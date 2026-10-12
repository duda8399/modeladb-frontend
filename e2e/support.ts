import { expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const BACKEND_URL = "http://127.0.0.1:3101";

export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  token: string;
  refreshToken: string;
};

/** Cria um usuário real no backend de teste (via API, mais rápido que a UI). */
export async function createUser(prefix: string): Promise<User> {
  const api = await request.newContext({ baseURL: BACKEND_URL });
  const email = `${prefix}-${randomUUID().slice(0, 8)}@e2e.modeladb`;
  const password = "senha-e2e-123";
  const name = `${prefix[0].toUpperCase()}${prefix.slice(1)} E2E`;

  expect((await api.post("/auth/register", { data: { name, email, password } })).ok()).toBe(true);
  const login = await api.post("/auth/login", { data: { email, password } });
  const body = await login.json();
  await api.dispose();

  return { id: body.userId, name, email, password, token: body.accessToken, refreshToken: body.refreshToken };
}

export async function createDiagramViaApi(owner: User, name = "Diagrama E2E"): Promise<string> {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
  const res = await api.post("/diagram/create", { data: { name } });
  const body = await res.json();
  await api.dispose();
  return body.id;
}

export async function shareViaApi(owner: User, diagramId: string, user: User, role: "EDITOR" | "VIEWER") {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
  expect((await api.post(`/diagram/${diagramId}/collaborators`, { data: { email: user.email, role } })).ok()).toBe(true);
  await api.dispose();
}

export async function getDiagramViaApi(user: User, diagramId: string) {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${user.token}` },
  });
  const body = await (await api.get(`/diagram/${diagramId}`)).json();
  await api.dispose();
  return body;
}

/** Abre um contexto de navegador já autenticado (token no localStorage). */
export async function loggedInContext(browser: Browser, user: User): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([token, refreshToken, userId]) => {
      if (localStorage.getItem("accessToken")) return;
      localStorage.setItem("accessToken", token);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("userId", userId);
    },
    [user.token, user.refreshToken, user.id],
  );
  return context;
}

/** Erros de JavaScript na página fazem o teste falhar. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return () => expect(errors, "erros de JavaScript na página").toEqual([]);
}

export async function openDiagram(page: Page, diagramId: string) {
  await page.goto(`/model/${diagramId}`);
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();
  // Espera o diagrama carregar e o socket entrar na sala.
  await page.waitForLoadState("networkidle");
}

export const entityNodes = (page: Page) => page.locator(".react-flow__node-entityNode");

export function entityNameInput(page: Page, index = 0) {
  return entityNodes(page).nth(index).locator(".ant-card-head input");
}

export async function addEntity(page: Page) {
  await page.getByRole("button", { name: "Adicionar Entidade" }).click();
}

export async function renameEntity(page: Page, index: number, name: string) {
  const input = entityNameInput(page, index);
  await input.click();
  await input.fill(name);
  await input.press("Enter");
}

export function avatar(page: Page, email: string) {
  return page.locator(`[title="${email}"]`);
}

export async function chooseMoreOption(page: Page, option: "Importar" | "Exportar" | "Histórico") {
  await page.getByRole("button", { name: "Mais opções" }).click();
  await page.getByRole("menuitem", { name: option }).click();
}
