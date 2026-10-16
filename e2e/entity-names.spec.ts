import { expect, request, test } from "@playwright/test";
import {
  BACKEND_URL,
  addEntity,
  createDiagramViaApi,
  createUser,
  entityNameInput,
  entityNodes,
  failOnPageErrors,
  getDiagramViaApi,
  loggedInContext,
  openDiagram,
  renameEntity,
  type User,
} from "./support";

async function putDiagram(owner: User, diagramId: string, body: Record<string, unknown>) {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
  expect((await api.put(`/diagram/${diagramId}`, { data: body })).ok()).toBe(true);
  await api.dispose();
}

const entityWithName = (id: string, name: string, x: number) => ({
  id,
  type: "entityNode",
  position: { x, y: 0 },
  data: {
    name,
    fields: [{ id: `${id}-pk`, name: "id", type: "INT", pk: true, fk: false, notNull: true, unique: true, ai: true }],
  },
});

test("entidades novas recebem nomes diferentes e renomear para um nome em uso é recusado", async ({ browser }) => {
  const owner = await createUser("nomes");
  const diagramId = await createDiagramViaApi(owner, "Nomes");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await addEntity(page);
  await addEntity(page);
  await expect(entityNodes(page)).toHaveCount(2);
  await expect(entityNameInput(page, 0)).toHaveValue("Entidade");
  await expect(entityNameInput(page, 1)).toHaveValue("Entidade_2");

  const second = entityNameInput(page, 1);
  await second.click();
  await second.fill("  ENTIDADE ");
  await expect(page.getByRole("tooltip")).toContainText('Já existe uma entidade chamada "Entidade".');
  await second.press("Enter");
  await expect(second).toHaveValue("Entidade_2");

  await second.click();
  await second.fill("");
  await expect(page.getByRole("tooltip")).toContainText("O nome não pode ficar vazio.");
  await second.press("Enter");
  await expect(second).toHaveValue("Entidade_2");

  await renameEntity(page, 1, "Pedido");
  await expect(second).toHaveValue("Pedido");

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await getDiagramViaApi(owner, diagramId)).nodes?.map((n: { data: { name: string } }) => n.data.name))
    .toEqual(["Entidade", "Pedido"]);
  assertNoErrors();
});

test("diagrama antigo com nomes repetidos mostra aviso até um deles ser renomeado", async ({ browser }) => {
  const owner = await createUser("repetidos");
  const diagramId = await createDiagramViaApi(owner, "Repetidos");
  await putDiagram(owner, diagramId, {
    nodes: [entityWithName("a", "Cliente", 0), entityWithName("b", "cliente", 400)],
    edges: [],
  });

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await expect(entityNodes(page).getByLabel("Nome repetido")).toHaveCount(2);
  await renameEntity(page, 1, "Fornecedor");
  await expect(entityNodes(page).getByLabel("Nome repetido")).toHaveCount(0);
  assertNoErrors();
});

test("uma view não pode ter o nome de uma entidade", async ({ browser }) => {
  const owner = await createUser("viewnome");
  const diagramId = await createDiagramViaApi(owner, "Views");
  await putDiagram(owner, diagramId, {
    nodes: [
      entityWithName("a", "Cliente", 0),
      { id: "v", type: "viewNode", position: { x: 400, y: 0 }, data: { name: "view_1", sql: "SELECT id FROM Cliente" } },
    ],
    edges: [],
  });

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  const viewName = page.getByLabel("Nome da view");
  await viewName.click();
  await viewName.fill("cliente");
  await expect(page.getByRole("tooltip")).toContainText('Já existe uma entidade chamada "Cliente".');
  await viewName.press("Enter");
  await expect(viewName).toHaveValue("view_1");
  assertNoErrors();
});
