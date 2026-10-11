import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  createDiagramViaApi,
  createUser,
  entityNodes,
  failOnPageErrors,
  getDiagramViaApi,
  loggedInContext,
  openDiagram,
  shareViaApi,
} from "./support";

const SQL = `
CREATE TABLE cliente (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  saldo DECIMAL(10,2) DEFAULT 0,
  CHECK (saldo >= 0)
);
CREATE TABLE pedido (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT,
  FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL
);
`;

async function importSql(page: Page, sql: string) {
  await page.getByRole("button", { name: "Importar" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "modelo.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

const entity = (page: Page, name: string) =>
  entityNodes(page).filter({ has: page.locator(`input[value="${name}"]`) });

const relationPath = (page: Page) => page.locator(".react-flow__edge-floating path.react-flow__edge-path").first();

test("tamanho, DEFAULT, CHECK, ações de FK e participação, com sincronização em tempo real", async ({ browser }) => {
  const owner = await createUser("logico");
  const editor = await createUser("editora");
  const diagramId = await createDiagramViaApi(owner, "Modelo lógico");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await importSql(page, SQL);
  await expect(entityNodes(page)).toHaveCount(2);
  await expect(entity(page, "cliente")).toContainText("VARCHAR(120)");
  await expect(entity(page, "cliente")).toContainText("DECIMAL(10,2)");
  await expect(entity(page, "cliente").getByTestId("entity-checks")).toContainText("saldo >= 0");
  await expect(relationPath(page)).toHaveAttribute("style", /stroke-dasharray/);

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(async () => (await getDiagramViaApi(owner, diagramId)).nodes?.length).toBe(2);
  await shareViaApi(owner, diagramId, editor, "EDITOR");
  const editorPage = await (await loggedInContext(browser, editor)).newPage();
  await openDiagram(editorPage, diagramId);
  await expect(entityNodes(editorPage)).toHaveCount(2);

  await page.getByTestId("edge-label").first().click();
  const relation = page.locator(".ant-modal").filter({ hasText: "Editar relacionamento" });
  await expect(relation).toContainText("pedido.cliente_id referencia cliente");
  await expect(relation.locator(".ant-select").first()).toContainText("SET NULL");
  await relation.getByText("Obrigatória", { exact: false }).click();
  await expect(relation.getByText("SET NULL exige que a chave estrangeira aceite NULL")).toBeVisible();
  await expect(relation.getByRole("button", { name: "Salvar" })).toBeDisabled();
  await relation.locator(".ant-select").first().click();
  await page.locator(".ant-select-dropdown:visible").getByText("CASCADE: propaga para os filhos", { exact: true }).click();
  await relation.getByRole("button", { name: "Salvar" }).click();
  await expect(relation).toBeHidden();
  await expect(relationPath(page)).not.toHaveAttribute("style", /stroke-dasharray/);

  await expect(editorPage.getByTestId("edge-label").first()).toHaveAttribute("title", /ON DELETE CASCADE/);
  await expect(relationPath(editorPage)).not.toHaveAttribute("style", /stroke-dasharray/);

  await entity(page, "cliente").getByRole("button", { name: "Configurar atributos" }).click();
  const attributes = page.locator(".ant-modal").filter({ hasText: "Configurar atributos" });
  const size = attributes.getByLabel("Tamanho").nth(1);
  await size.fill("abc");
  await expect(size).toHaveClass(/ant-input-status-error/);
  await size.fill("80");
  await size.press("Enter");
  const defaultValue = attributes.getByLabel("Valor padrão").nth(1);
  await defaultValue.fill("'sem nome'");
  await defaultValue.press("Enter");
  await expect(attributes.getByLabel("Valor padrão").first()).toBeDisabled();
  await attributes.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(entity(page, "cliente")).toContainText("VARCHAR(80)");
  await expect(entity(editorPage, "cliente")).toContainText("VARCHAR(80)");

  await entity(page, "cliente").getByRole("button", { name: "Restrições" }).click();
  const constraints = page.locator(".ant-modal").filter({ hasText: "Índices e restrições de cliente" });
  await constraints.getByRole("tab", { name: /CHECK/ }).click();
  await constraints.getByRole("button", { name: "Adicionar CHECK" }).click();
  await constraints.getByLabel("Condição").nth(1).fill("length(nome) > 1");
  await constraints.getByRole("button", { name: "Salvar" }).click();
  await expect(entity(page, "cliente").getByTestId("entity-checks")).toContainText("length(nome) > 1");
  await expect(entity(editorPage, "cliente").getByTestId("entity-checks")).toContainText("length(nome) > 1");

  await expect(constraints).toBeHidden();
  await page.screenshot({ path: process.env.LOGICAL_SHOT || "test-results/logical-model.png" });

  await page.getByTitle("Exportar para MySQL").click();
  const exportModal = page.locator(".ant-modal").filter({ hasText: "Exportar para banco de dados" });
  await expect(exportModal.locator(".cm-content")).toContainText("CREATE TABLE");
  const downloadPromise = page.waitForEvent("download");
  await exportModal.getByRole("button", { name: "Baixar .sql" }).click();
  const script = readFileSync(await (await downloadPromise).path(), "utf8");
  expect(script).toContain("`nome` VARCHAR(80) DEFAULT 'sem nome' NOT NULL");
  expect(script).toContain("`saldo` DECIMAL(10,2) DEFAULT 0");
  expect(script).toContain("CONSTRAINT `chk_cliente_1` CHECK (saldo >= 0)");
  expect(script).toContain("CONSTRAINT `chk_cliente_2` CHECK (length(nome) > 1)");
  expect(script).toContain("`cliente_id` INT NOT NULL");
  expect(script).toContain("REFERENCES `cliente`(`id`) ON DELETE CASCADE;");
  await exportModal.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await getDiagramViaApi(owner, diagramId)).edges?.[0]?.data?.onDelete)
    .toBe("CASCADE");
  assertNoErrors();
});
