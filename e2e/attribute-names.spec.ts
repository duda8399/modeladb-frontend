import { expect, request, test, type Page } from "@playwright/test";
import {
  BACKEND_URL,
  addEntity,
  createDiagramViaApi,
  createUser,
  entityNodes,
  failOnPageErrors,
  getDiagramViaApi,
  loggedInContext,
  openDiagram,
  type User,
} from "./support";

const attributesModal = (page: Page) =>
  page.locator(".ant-modal:visible").filter({ hasText: "Configurar atributos" });

async function putDiagram(owner: User, diagramId: string, body: Record<string, unknown>) {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
  expect((await api.put(`/diagram/${diagramId}`, { data: body })).ok()).toBe(true);
  await api.dispose();
}

test("um atributo não pode ter o nome de outro atributo da mesma entidade", async ({ browser }) => {
  const owner = await createUser("atributos");
  const diagramId = await createDiagramViaApi(owner, "Atributos");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await addEntity(page);
  await entityNodes(page).first().getByRole("button", { name: "Configurar atributos" }).click();
  const modal = attributesModal(page);
  const names = modal.getByPlaceholder("Nome da coluna");

  await modal.getByRole("button", { name: "+ Adicionar atributo" }).click();
  await names.nth(1).fill("nome");
  await names.nth(1).press("Enter");
  await expect(names.nth(1)).toHaveValue("nome");

  await modal.getByRole("button", { name: "+ Adicionar atributo" }).click();
  await names.nth(2).fill(" NOME ");
  await expect(page.getByRole("tooltip").filter({ hasText: 'Já existe o atributo "nome" nesta entidade.' })).toBeVisible();
  await names.nth(2).press("Enter");
  await expect(names.nth(2)).toHaveValue("");

  await names.nth(1).fill("ID");
  await expect(page.getByRole("tooltip").filter({ hasText: 'Já existe o atributo "id" nesta entidade.' })).toBeVisible();
  await names.nth(1).press("Enter");
  await expect(names.nth(1)).toHaveValue("nome");

  await names.nth(2).fill("email");
  await names.nth(2).press("Enter");
  await expect(modal.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => {
      const fields = (await getDiagramViaApi(owner, diagramId)).nodes?.[0]?.data?.fields ?? [];
      return fields.filter((f: { deleted?: boolean }) => !f.deleted).map((f: { name: string }) => f.name);
    })
    .toEqual(["id", "nome", "email"]);
  assertNoErrors();
});

test("entidade antiga com atributos repetidos mostra aviso até a correção", async ({ browser }) => {
  const owner = await createUser("legadoattr");
  const diagramId = await createDiagramViaApi(owner, "Legado");
  const column = (id: string, name: string, pk = false) => ({
    id,
    name,
    type: "INT",
    pk,
    fk: false,
    notNull: pk,
    unique: pk,
    ai: false,
  });
  await putDiagram(owner, diagramId, {
    nodes: [
      {
        id: "n1",
        type: "entityNode",
        position: { x: 0, y: 0 },
        data: { name: "Cliente", fields: [column("f1", "id", true), column("f2", "nome"), column("f3", "NOME")] },
      },
    ],
    edges: [],
  });

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  const node = entityNodes(page).first();
  await expect(node.getByLabel("Atributos repetidos")).toBeVisible();

  await node.getByRole("button", { name: "Configurar atributos" }).click();
  const modal = attributesModal(page);
  await expect(modal.getByText("Há atributos com o mesmo nome nesta entidade.")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await expect(modal.locator('[class*="status-error"]:has(input[placeholder="Nome da coluna"])')).toHaveCount(2);

  const names = modal.getByPlaceholder("Nome da coluna");
  await names.nth(2).fill("apelido");
  await names.nth(2).press("Enter");
  await expect(modal.getByText("Há atributos com o mesmo nome nesta entidade.")).toHaveCount(0);
  await expect(modal.locator('[class*="status-error"]:has(input[placeholder="Nome da coluna"])')).toHaveCount(0);
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(node.getByLabel("Atributos repetidos")).toHaveCount(0);
  assertNoErrors();
});
