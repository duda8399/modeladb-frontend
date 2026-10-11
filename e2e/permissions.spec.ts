import { expect, request, test } from "@playwright/test";
import {
  BACKEND_URL,
  type User,
  addEntity,
  createDiagramViaApi,
  createUser,
  entityNameInput,
  entityNodes,
  failOnPageErrors,
  loggedInContext,
  openDiagram,
  renameEntity,
  shareViaApi,
} from "./support";

async function ownerApi(owner: User) {
  return request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${owner.token}` },
  });
}

/**
 * Item 5 — Papéis e compartilhamento vistos pela interface.
 */
test.describe("Permissões e compartilhamento", () => {
  test("o dono compartilha pela interface e a pessoa convidada vê o diagrama com o papel certo", async ({ browser }) => {
    const owner = await createUser("dono");
    const guest = await createUser("convidada");
    const diagramId = await createDiagramViaApi(owner, "Diagrama compartilhado");

    const ownerPage = await (await loggedInContext(browser, owner)).newPage();
    const assertNoErrors = failOnPageErrors(ownerPage);
    await openDiagram(ownerPage, diagramId);

    await ownerPage.locator('button[title="Compartilhar diagrama"]').click();
    const modal = ownerPage.locator(".ant-modal").filter({ hasText: "Convidar" });
    await modal.getByPlaceholder("E-mail do colaborador").fill(guest.email);
    await modal.locator(".ant-select").first().click();
    await ownerPage.locator(".ant-select-dropdown:visible").getByText("Visualizador", { exact: true }).click();
    await modal.getByRole("button", { name: "Convidar" }).click();

    await expect(ownerPage.getByText("Colaborador adicionado com sucesso.")).toBeVisible();
    await expect(modal.getByText(guest.email)).toBeVisible();

    const guestPage = await (await loggedInContext(browser, guest)).newPage();
    await guestPage.goto("/shared");

    const card = guestPage.locator(".ant-card").filter({ hasText: "Diagrama compartilhado" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Visualizador")).toBeVisible();
    await expect(card.getByText(owner.name)).toBeVisible();
    assertNoErrors();
  });

  test("convidar um e-mail não cadastrado mostra o erro do servidor", async ({ browser }) => {
    const owner = await createUser("dono");
    const diagramId = await createDiagramViaApi(owner);
    const page = await (await loggedInContext(browser, owner)).newPage();
    await openDiagram(page, diagramId);

    await page.locator('button[title="Compartilhar diagrama"]').click();
    await page.getByPlaceholder("E-mail do colaborador").fill("ninguem@e2e.modeladb");
    await page.getByRole("button", { name: "Convidar" }).click();

    await expect(page.getByText("Usuário não encontrado.")).toBeVisible();
  });

  test("um VISUALIZADOR acompanha as edições, mas não consegue editar", async ({ browser }) => {
    const owner = await createUser("dono");
    const viewer = await createUser("leitor");
    const diagramId = await createDiagramViaApi(owner);
    await shareViaApi(owner, diagramId, viewer, "VIEWER");

    const ownerPage = await (await loggedInContext(browser, owner)).newPage();
    const viewerPage = await (await loggedInContext(browser, viewer)).newPage();
    const checks = [failOnPageErrors(ownerPage), failOnPageErrors(viewerPage)];
    await openDiagram(ownerPage, diagramId);
    await openDiagram(viewerPage, diagramId);

    // Recebe as edições do dono em tempo real.
    await addEntity(ownerPage);
    await renameEntity(ownerPage, 0, "Produto");
    await expect(entityNameInput(viewerPage)).toHaveValue("Produto");

    // Controles de edição bloqueados.
    await expect(viewerPage.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
    await expect(viewerPage.getByRole("button", { name: "Importar" })).toHaveCount(0);

    await addEntity(viewerPage);
    await expect(entityNodes(viewerPage)).toHaveCount(1);
    await expect(entityNodes(ownerPage)).toHaveCount(1);

    // Tentativa de renomear localmente não chega ao dono.
    await renameEntity(viewerPage, 0, "Alterado pelo leitor");
    await ownerPage.waitForTimeout(1000);
    await expect(entityNameInput(ownerPage)).toHaveValue("Produto");

    checks.forEach((check) => check());
  });

  test("um VISUALIZADOR não consegue arrastar entidades", async ({ browser }) => {
    const owner = await createUser("dono");
    const viewer = await createUser("leitor");
    const diagramId = await createDiagramViaApi(owner);
    await shareViaApi(owner, diagramId, viewer, "VIEWER");

    const ownerPage = await (await loggedInContext(browser, owner)).newPage();
    const viewerPage = await (await loggedInContext(browser, viewer)).newPage();
    await openDiagram(ownerPage, diagramId);
    await openDiagram(viewerPage, diagramId);
    await addEntity(ownerPage);
    await expect(entityNodes(viewerPage)).toHaveCount(1);

    const node = entityNodes(viewerPage).first();
    const before = await node.boundingBox();
    const header = node.locator(".ant-card-body");
    const box = (await header.boundingBox())!;
    await viewerPage.mouse.move(box.x + 20, box.y + box.height / 2);
    await viewerPage.mouse.down();
    await viewerPage.mouse.move(box.x + 220, box.y + 200, { steps: 10 });
    await viewerPage.mouse.up();

    expect(await node.boundingBox()).toEqual(before);
  });

  test("quem não tem acesso vê a mensagem de erro e nenhum dado do diagrama", async ({ browser }) => {
    const owner = await createUser("dono");
    const stranger = await createUser("estranho");
    const diagramId = await createDiagramViaApi(owner, "Segredo");

    const page = await (await loggedInContext(browser, stranger)).newPage();
    await page.goto(`/model/${diagramId}`);

    // Em modo de desenvolvimento o React monta a página duas vezes, então a
    // mensagem pode aparecer em dobro; basta que apareça.
    await expect(page.getByText("Sem acesso a este diagrama.").first()).toBeVisible();
    await expect(entityNodes(page)).toHaveCount(0);
    await expect(page.getByPlaceholder("Nome do diagrama")).not.toHaveValue("Segredo");
  });

  test("rebaixar um EDITOR com o diagrama aberto deixa a tela dele somente leitura na hora", async ({ browser }) => {
    const owner = await createUser("dono");
    const editor = await createUser("editor");
    const diagramId = await createDiagramViaApi(owner);
    await shareViaApi(owner, diagramId, editor, "EDITOR");

    const editorPage = await (await loggedInContext(browser, editor)).newPage();
    const assertNoErrors = failOnPageErrors(editorPage);
    await openDiagram(editorPage, diagramId);
    await expect(editorPage.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();

    const api = await ownerApi(owner);
    expect((await api.patch(`/diagram/${diagramId}/collaborators/${editor.id}`, { data: { role: "VIEWER" } })).ok()).toBe(true);
    await api.dispose();

    await expect(editorPage.getByText("Sua permissão mudou para Leitor")).toBeVisible();
    await expect(editorPage.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
    await expect(editorPage.getByRole("button", { name: "Importar" })).toHaveCount(0);
    assertNoErrors();
  });

  test("remover um colaborador com o diagrama aberto avisa e leva de volta aos compartilhados", async ({ browser }) => {
    const owner = await createUser("dono");
    const editor = await createUser("editor");
    const diagramId = await createDiagramViaApi(owner);
    await shareViaApi(owner, diagramId, editor, "EDITOR");

    const editorPage = await (await loggedInContext(browser, editor)).newPage();
    const assertNoErrors = failOnPageErrors(editorPage);
    await openDiagram(editorPage, diagramId);

    const api = await ownerApi(owner);
    expect((await api.delete(`/diagram/${diagramId}/collaborators/${editor.id}`)).ok()).toBe(true);
    await api.dispose();

    const dialog = editorPage.locator(".ant-modal").filter({ hasText: "Acesso removido" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Voltar" }).click();
    await expect(editorPage).toHaveURL(/\/shared$/);
    assertNoErrors();
  });
});
