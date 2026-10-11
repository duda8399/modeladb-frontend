import { expect, test, type Page } from "@playwright/test";
import {
  createDiagramViaApi,
  createUser,
  entityNodes,
  failOnPageErrors,
  loggedInContext,
  openDiagram,
  shareViaApi,
} from "./support";

const SQL = "CREATE TABLE cliente (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(80));";

async function importSql(page: Page, sql: string) {
  await page.getByRole("button", { name: "Importar" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "m.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

const drawer = (page: Page) => page.locator(".ant-drawer").filter({ hasText: "Histórico de versões" });
const items = (page: Page) => drawer(page).getByTestId("version-item");

async function waitSaved(page: Page) {
  await expect(page.getByText(/Salvo às/)).toBeVisible({ timeout: 15_000 });
}

test("salva, compara e restaura versões, avisando os colaboradores", async ({ browser }) => {
  const owner = await createUser("historico");
  const editor = await createUser("colega");
  const viewer = await createUser("leitor");
  const diagramId = await createDiagramViaApi(owner, "Com histórico");
  await shareViaApi(owner, diagramId, editor, "EDITOR");
  await shareViaApi(owner, diagramId, viewer, "VIEWER");

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await importSql(page, SQL);
  await expect(entityNodes(page)).toHaveCount(1);
  await waitSaved(page);

  await page.getByRole("button", { name: "Histórico" }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("Salvamento automático");
  await expect(items(page).first()).toContainText("1 tabela · 0 relacionamentos");

  await drawer(page).getByLabel("Nome da versão").fill("Entrega 1");
  await drawer(page).getByRole("button", { name: "Salvar versão" }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).first()).toContainText("Manual");
  await expect(items(page).first()).toContainText("Entrega 1");
  await drawer(page).locator(".ant-drawer-close").click();

  await page.getByText("Adicionar Entidade", { exact: true }).click();
  await expect(entityNodes(page)).toHaveCount(2);
  await waitSaved(page);

  const editorPage = await (await loggedInContext(browser, editor)).newPage();
  await openDiagram(editorPage, diagramId);
  await expect(entityNodes(editorPage)).toHaveCount(2);

  await page.getByRole("button", { name: "Histórico" }).click();
  const entrega = items(page).filter({ hasText: "Entrega 1" });
  await entrega.getByRole("button", { name: "Visualizar" }).click();
  const preview = page.locator(".ant-modal").filter({ hasText: "Mudanças feitas desde esta versão" });
  await expect(preview.getByTestId("version-preview-canvas").locator(".react-flow__node-entityNode")).toHaveCount(1);
  await expect(preview.getByTestId("version-changes")).toContainText("Tabela Entidade criada");

  await preview.getByRole("button", { name: "Restaurar esta versão" }).click();
  await page.locator(".ant-popover:visible").getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Versão restaurada.")).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(entityNodes(page)).toHaveCount(1);

  await expect(editorPage.getByText(/restaurou uma versão anterior/)).toBeVisible();
  await expect(entityNodes(editorPage)).toHaveCount(1);

  await expect(items(page)).toHaveCount(3);
  await expect(items(page).first()).toContainText('Antes de restaurar "Entrega 1"');
  await expect(items(page).first()).toContainText("Backup");
  await expect(items(page).first()).toContainText("2 tabelas");

  await page.waitForTimeout(2_500);
  await page.reload();
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();
  await expect(entityNodes(page)).toHaveCount(1);

  const viewerPage = await (await loggedInContext(browser, viewer)).newPage();
  await openDiagram(viewerPage, diagramId);
  await viewerPage.getByRole("button", { name: "Histórico" }).click();
  await expect(items(viewerPage)).toHaveCount(3);
  await expect(drawer(viewerPage).getByRole("button", { name: "Salvar versão" })).toHaveCount(0);
  await expect(drawer(viewerPage).getByRole("button", { name: "Restaurar" })).toHaveCount(0);
  await expect(drawer(viewerPage).getByRole("button", { name: "Visualizar" })).toHaveCount(3);

  assertNoErrors();
});
