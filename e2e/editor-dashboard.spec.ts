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
  chooseMoreOption,
} from "./support";

const SQL = `
CREATE TABLE cliente (id INT PRIMARY KEY, nome VARCHAR(50));
CREATE TABLE pedido (id INT PRIMARY KEY, cliente_id INT, FOREIGN KEY (cliente_id) REFERENCES cliente(id));
CREATE TABLE registro (id INT PRIMARY KEY, mensagem TEXT);
`;

async function importSql(page: Page, sql: string) {
  await chooseMoreOption(page, "Importar");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "modelo.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

const entity = (page: Page, name: string) =>
  entityNodes(page).filter({ has: page.locator(`input[value="${name}"]`) });

async function exportMySql(page: Page) {
  await page.getByTitle("Exportar para MySQL").click();
  const modal = page.locator(".ant-modal").filter({ hasText: "Exportar para banco de dados" });
  await expect(modal.locator(".cm-content")).toContainText("CREATE TABLE");
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Baixar .sql" }).click();
  const script = readFileSync(await (await downloadPromise).path(), "utf8");
  return { modal, script };
}

test("ENUM com valores, descrições, nome repetido recusado e FK renomeada", async ({ browser }) => {
  const owner = await createUser("enum");
  const diagramId = await createDiagramViaApi(owner, "Loja");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);
  await importSql(page, SQL);
  await expect(entityNodes(page)).toHaveCount(3);

  const registroName = entityNodes(page).nth(2).getByLabel("Nome da entidade");
  await registroName.click();
  await registroName.fill("Cliente");
  await expect(page.getByRole("tooltip")).toContainText('Já existe uma entidade chamada "cliente".');
  await registroName.press("Enter");
  await expect(registroName).toHaveValue("registro");
  await expect(entityNodes(page).getByLabel("Nome repetido")).toHaveCount(0);

  await entity(page, "cliente").getByRole("button", { name: "Configurar atributos" }).click();
  const attributes = page.locator(".ant-modal:visible").filter({ hasText: "Configurar atributos" });
  await expect(attributes.locator(".ant-modal-title")).toHaveText("Configurar atributos - Tabela cliente");
  const tableDescription = attributes.getByLabel("Descrição da tabela");
  await tableDescription.fill("Quem compra na loja");
  await tableDescription.press("Enter");
  await attributes.getByRole("button", { name: "Descrição da coluna" }).nth(1).click();
  const nameDescription = attributes.getByLabel("Descrição de nome");
  await nameDescription.fill("Nome completo");
  await nameDescription.press("Enter");

  await attributes.getByRole("button", { name: "+ Adicionar atributo" }).click();
  const newName = attributes.getByPlaceholder("Nome da coluna").last();
  await newName.fill("situacao");
  await newName.press("Enter");
  await attributes.locator(".ant-select").filter({ hasText: "Tipo" }).last().click();
  await page.keyboard.type("ENUM");
  await page.keyboard.press("Enter");
  const values = attributes.getByRole("combobox", { name: "Valores permitidos" });
  await expect(values).toBeVisible();
  await values.fill("ativo");
  await values.press("Enter");
  await values.fill("inativo");
  await values.press("Enter");
  await attributes.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(attributes).toHaveCount(0);
  await expect(entity(page, "cliente")).toContainText("ENUM(ativo, inativo)");

  await entity(page, "pedido").getByRole("button", { name: "Configurar atributos" }).click();
  const fkName = attributes.getByPlaceholder("Nome da coluna").nth(1);
  await fkName.fill("comprador_id");
  await fkName.press("Enter");
  await attributes.getByRole("button", { name: "Salvar", exact: true }).click();

  const { modal, script } = await exportMySql(page);
  expect(script).toContain("CREATE TABLE `registro`");
  expect(script).toContain("`situacao` ENUM('ativo', 'inativo')");
  expect(script).toContain("`nome` VARCHAR(50) COMMENT 'Nome completo'");
  expect(script).toContain(") COMMENT='Quem compra na loja';");
  expect(script).toContain("FOREIGN KEY (`comprador_id`) REFERENCES `cliente`(`id`)");
  await modal.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await getDiagramViaApi(owner, diagramId)).edges?.[0]?.data?.fkFieldName)
    .toBe("comprador_id");
  assertNoErrors();
});

test("renomear e duplicar pelo card, com aviso a quem está no editor", async ({ browser }) => {
  const owner = await createUser("cards");
  const editor = await createUser("cards-editor");
  const diagramId = await createDiagramViaApi(owner, "Biblioteca");
  await shareViaApi(owner, diagramId, editor, "EDITOR");

  const editorPage = await (await loggedInContext(browser, editor)).newPage();
  await openDiagram(editorPage, diagramId);
  await expect(editorPage.getByLabel("Nome do diagrama")).toHaveValue("Biblioteca");

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/documents");
  const card = page.locator(".ant-card").filter({ hasText: "Biblioteca" });
  await card.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  const rename = page.locator(".ant-modal").filter({ hasText: "Renomear diagrama" });
  await rename.getByLabel("Novo nome").fill("Biblioteca Central");
  await rename.getByRole("button", { name: "Renomear" }).click();
  await expect(page.locator(".ant-card").filter({ hasText: "Biblioteca Central" })).toHaveCount(1);
  await expect(editorPage.getByLabel("Nome do diagrama")).toHaveValue("Biblioteca Central");
  expect((await getDiagramViaApi(owner, diagramId)).name).toBe("Biblioteca Central");

  await page.locator(".ant-card").filter({ hasText: "Biblioteca Central" }).getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Duplicar" }).click();
  await expect(page.locator(".ant-card").filter({ hasText: "Cópia de Biblioteca Central" })).toHaveCount(1);
  await page.reload();
  const copyCard = page.locator(".ant-card").filter({ hasText: "Cópia de Biblioteca Central" });
  await expect(copyCard).toHaveCount(1);
  await copyCard.screenshot({ path: process.env.CARD_SHOT || "test-results/card.png" });

  await copyCard.getByRole("button", { name: "Mais ações" }).click();
  await expect(page.locator(".ant-dropdown:visible .ant-dropdown-menu-title-content")).toHaveText([
    "Duplicar",
    "Renomear",
    "Compartilhar",
  ]);
  await page.getByRole("menuitem", { name: "Compartilhar" }).click();
  await expect(page.locator(".ant-modal:visible")).toContainText("Compartilhar");
  assertNoErrors();
});

test("o convidado é avisado na hora e o convite some depois de aberto", async ({ browser }) => {
  const owner = await createUser("convite-dono");
  const invitee = await createUser("convidada");
  const diagramId = await createDiagramViaApi(owner, "Hospital");

  const page = await (await loggedInContext(browser, invitee)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await page.goto("/");
  const bell = page.getByRole("button", { name: "Convites" });
  await expect(bell).toBeVisible();
  await page.waitForTimeout(500);

  await shareViaApi(owner, diagramId, invitee, "VIEWER");

  const toast = page.locator(".ant-notification-notice").filter({ hasText: "Novo diagrama compartilhado" });
  await expect(toast).toContainText(`compartilhou "Hospital" com você como Visualizador`);
  await expect(bell.locator(".ant-badge-count")).toHaveText("1");

  await page.reload();
  await expect(bell.locator(".ant-badge-count")).toHaveText("1");
  await bell.click();
  await page.getByTestId("invitation-item").filter({ hasText: "Hospital" }).click();
  await expect(page).toHaveURL(new RegExp(`/model/${diagramId}$`));

  await page.goto("/");
  await expect(bell).toBeVisible();
  await page.waitForTimeout(500);
  await expect(bell.locator(".ant-badge-count")).toHaveCount(0);
  assertNoErrors();
});

test("a barra lateral mostra DER em ícones e abre o gerador da IA num painel", async ({ browser }) => {
  const owner = await createUser("sidebar");
  const diagramId = await createDiagramViaApi(owner, "Barra lateral");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await expect(page.getByText("DER", { exact: true })).toBeVisible();
  await expect(page.locator("[data-connection-status]")).toHaveCount(0);
  await page.getByRole("button", { name: "Adicionar View" }).click();
  await expect(page.locator(".react-flow__node-viewNode")).toHaveCount(1);
  await expect(page.getByPlaceholder("Descreva seu banco de dados...")).toHaveCount(0);
  await page.screenshot({ path: process.env.SIDEBAR_SHOT || "test-results/sidebar.png", clip: { x: 0, y: 60, width: 320, height: 700 } });

  await page.getByRole("button", { name: "Gerar com IA" }).click();
  const drawer = page.locator(".ant-drawer").filter({ hasText: "Gerar com IA" });
  await expect(drawer.getByLabel("Descrição do banco de dados")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Gerar diagrama" })).toBeEnabled();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Histórico" }).click();
  await expect(page.locator(".ant-drawer").filter({ hasText: "Histórico de versões" })).toBeVisible();
  assertNoErrors();
});
