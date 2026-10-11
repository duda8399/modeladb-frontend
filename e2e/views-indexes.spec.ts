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
} from "./support";

const SCHEMA_SQL = `
CREATE TABLE cliente (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(255),
  cidade VARCHAR(80),
  KEY idx_nome (nome)
);
CREATE TABLE pedido (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  total DECIMAL(10,2),
  FOREIGN KEY (cliente_id) REFERENCES cliente(id)
);
CREATE UNIQUE INDEX uq_email ON cliente (email);
CREATE VIEW total_por_cliente AS
  SELECT c.nome, sum(p.total) AS total FROM cliente c JOIN pedido p ON p.cliente_id = c.id GROUP BY c.nome;
`;

const viewNodes = (page: Page) => page.locator(".react-flow__node-viewNode");
const viewEdges = (page: Page) => page.locator(".react-flow__edge-viewEdge");

async function importSql(page: Page, sql: string) {
  await page.getByRole("button", { name: "Importar" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "schema.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

test("importa, edita e exporta índices e views", async ({ browser }) => {
  const owner = await createUser("views");
  const diagramId = await createDiagramViaApi(owner, "Views e índices");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await importSql(page, SCHEMA_SQL);
  await expect(page.getByText("SQL importado: 2 tabelas, 1 relacionamento, 2 índices e 1 view")).toBeVisible();
  await expect(entityNodes(page)).toHaveCount(2);
  await expect(viewNodes(page)).toHaveCount(1);
  await expect(viewEdges(page)).toHaveCount(2);

  const cliente = entityNodes(page).filter({ has: page.locator('input[value="cliente"]') });
  await expect(cliente.getByTestId("entity-indexes")).toContainText("idx_nome (nome)");
  await expect(cliente.getByTestId("entity-indexes")).toContainText("uq_email (email)");
  await expect(viewNodes(page).first()).toContainText("Fonte: cliente, pedido");

  await cliente.getByRole("button", { name: "Índices" }).click();
  const modal = page.locator(".ant-modal").filter({ hasText: "Índices de cliente" });
  await modal.getByRole("button", { name: "Adicionar índice" }).click();
  const newRow = modal.getByTestId("index-row").nth(2);
  await newRow.locator(".ant-select").click();
  await page.locator(".ant-select-dropdown:visible").getByText("cidade", { exact: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByText("nome", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(newRow.getByLabel("Nome do índice")).toHaveAttribute("placeholder", "idx_cliente_cidade_nome");
  await modal.getByRole("button", { name: "Salvar" }).click();
  await expect(cliente.getByTestId("entity-indexes")).toContainText("idx_cliente_cidade_nome (cidade, nome)");

  await page.getByText("Adicionar View", { exact: true }).click();
  await expect(viewNodes(page)).toHaveCount(2);
  const novaView = viewNodes(page).nth(1);
  await expect(novaView).toContainText("Sem consulta definida");
  await novaView.getByRole("button", { name: "Editar consulta" }).click();
  const editor = page.locator(".ant-modal").filter({ hasText: "Consulta da view" });
  await editor.locator(".cm-content").click();
  await page.keyboard.type("SELECT id, email FROM cliente WHERE cidade = 'Recife'");
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(novaView).toContainText("email");
  await expect(viewEdges(page)).toHaveCount(3);

  await page.screenshot({ path: process.env.VIEWS_SHOT || "test-results/views-indexes.png" });

  await page.getByTitle("Exportar para PostgreSQL").click();
  const exportModal = page.locator(".ant-modal").filter({ hasText: "Exportar para banco de dados" });
  await expect(exportModal.locator(".cm-content")).toContainText("CREATE TABLE");
  const downloadPromise = page.waitForEvent("download");
  await exportModal.getByRole("button", { name: "Baixar .sql" }).click();
  const script = readFileSync(await (await downloadPromise).path(), "utf8");
  expect(script).toContain('CREATE INDEX "idx_nome" ON "cliente" ("nome");');
  expect(script).toContain('CREATE UNIQUE INDEX "uq_email" ON "cliente" ("email");');
  expect(script).toContain('CREATE INDEX "idx_cliente_cidade_nome" ON "cliente" ("cidade", "nome");');
  expect(script).toContain('CREATE VIEW "total_por_cliente" AS\nSELECT c.nome, sum(p.total) AS total FROM cliente c');
  expect(script).toContain(`CREATE VIEW "view_2" AS\nSELECT id, email FROM cliente WHERE cidade = 'Recife';`);
  await exportModal.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await getDiagramViaApi(owner, diagramId)).nodes?.filter((n: { type: string }) => n.type === "viewNode").length)
    .toBe(2);

  await page.reload();
  await expect(viewNodes(page)).toHaveCount(2);
  await expect(viewEdges(page)).toHaveCount(3);
  await expect(cliente.getByTestId("entity-indexes")).toContainText("idx_cliente_cidade_nome");
  assertNoErrors();
});
