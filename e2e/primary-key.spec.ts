import { expect, request, test, type Page } from "@playwright/test";
import {
  BACKEND_URL,
  addEntity,
  chooseMoreOption,
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


async function importSql(page: Page, sql: string) {
  await chooseMoreOption(page, "Importar");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "m.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

async function putDiagram(owner: User, diagramId: string, body: Record<string, unknown>) {
  const api = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
  expect((await api.put(`/diagram/${diagramId}`, { data: body })).ok()).toBe(true);
  await api.dispose();
}

test("entidade nova nasce com PK e a última PK não pode ser desmarcada nem removida", async ({ browser }) => {
  const owner = await createUser("pk");
  const diagramId = await createDiagramViaApi(owner, "Chaves");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await addEntity(page);
  const node = entityNodes(page).first();
  await expect(node.getByText("id", { exact: true })).toBeVisible();
  await expect(node.getByLabel("Sem chave primária")).toHaveCount(0);

  await node.getByRole("button", { name: "Configurar atributos" }).click();
  const modal = attributesModal(page);
  const pkBoxes = modal.getByRole("checkbox", { name: "Chave primária" });
  const removeButtons = modal.getByRole("button", { name: "Remover atributo" });
  await expect(pkBoxes.first()).toBeChecked();
  await expect(pkBoxes.first()).toBeDisabled();
  await expect(removeButtons.first()).toBeDisabled();

  await modal.getByRole("button", { name: "+ Adicionar atributo" }).click();
  const newName = modal.getByPlaceholder("Nome da coluna").last();
  await newName.fill("codigo");
  await newName.press("Enter");
  await pkBoxes.nth(1).check();
  await expect(pkBoxes.first()).toBeEnabled();

  await pkBoxes.first().uncheck();
  await expect(pkBoxes.nth(1)).toBeDisabled();
  await expect(removeButtons.nth(1)).toBeDisabled();
  await removeButtons.first().click();
  await expect(modal.getByPlaceholder("Nome da coluna")).toHaveCount(1);
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => {
      const fields = (await getDiagramViaApi(owner, diagramId)).nodes?.[0]?.data?.fields ?? [];
      return fields.filter((f: { deleted?: boolean }) => !f.deleted).map((f: { name: string; pk: boolean }) => [f.name, f.pk]);
    })
    .toEqual([["codigo", true]]);
  assertNoErrors();
});

test("entidade antiga sem PK mostra aviso e só salva depois de definir a chave", async ({ browser }) => {
  const owner = await createUser("legado");
  const diagramId = await createDiagramViaApi(owner, "Legado");
  await putDiagram(owner, diagramId, {
    nodes: [
      {
        id: "n1",
        type: "entityNode",
        position: { x: 0, y: 0 },
        data: {
          name: "log",
          fields: [{ id: "f1", name: "mensagem", type: "TEXT", pk: false, fk: false, notNull: false, unique: false, ai: false }],
        },
      },
    ],
    edges: [],
  });

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  const node = entityNodes(page).first();
  await expect(node.getByLabel("Sem chave primária")).toBeVisible();

  await node.getByRole("button", { name: "Configurar atributos" }).click();
  const modal = attributesModal(page);
  await expect(modal.getByText("Esta entidade não tem chave primária.")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();

  await modal.getByRole("button", { name: "Definir chave primária" }).click();
  await expect(modal.getByText("Esta entidade não tem chave primária.")).toHaveCount(0);
  await expect(modal.getByPlaceholder("Nome da coluna")).toHaveCount(2);
  await expect(modal.getByPlaceholder("Nome da coluna").last()).toHaveValue("id");
  await expect(modal.getByRole("checkbox", { name: "Chave primária" }).last()).toBeChecked();
  await modal.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(node.getByLabel("Sem chave primária")).toHaveCount(0);
  assertNoErrors();
});

test("remover um relacionamento identificador mantém a coluna como PK do filho", async ({ browser }) => {
  const owner = await createUser("identificador");
  const diagramId = await createDiagramViaApi(owner, "Identificador");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await importSql(
    page,
    [
      "CREATE TABLE pessoa (id INT PRIMARY KEY);",
      "CREATE TABLE passaporte (pessoa_id INT PRIMARY KEY, numero VARCHAR(20),",
      "FOREIGN KEY (pessoa_id) REFERENCES pessoa(id));",
    ].join("\n"),
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await page.locator(".react-flow__edge-floating path.react-flow__edge-path").first().hover({ force: true });
  await page.getByRole("button", { name: "Remover conexão" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);

  const passaporte = entityNodes(page).filter({ has: page.locator('input[value="passaporte"]') });
  await expect(passaporte.getByText("pessoa_id", { exact: true })).toBeVisible();
  await expect(passaporte.getByLabel("Sem chave primária")).toHaveCount(0);
  assertNoErrors();
});

test("importar SQL com tabela sem PK cria a coluna id e avisa", async ({ browser }) => {
  const owner = await createUser("importpk");
  const diagramId = await createDiagramViaApi(owner, "Importação");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await importSql(page, "CREATE TABLE evento (descricao TEXT);");
  await expect(page.locator(".ant-modal-confirm").getByText(/foi criada a coluna "id" como PK/)).toBeVisible();
  await expect(entityNodes(page).first().getByText("id", { exact: true })).toBeVisible();
  await expect(entityNodes(page).first().getByLabel("Sem chave primária")).toHaveCount(0);
  assertNoErrors();
});
