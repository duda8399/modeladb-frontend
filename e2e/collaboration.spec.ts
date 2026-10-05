import { expect, test, type Page } from "@playwright/test";
import {
  addEntity,
  avatar,
  createDiagramViaApi,
  createUser,
  entityNameInput,
  entityNodes,
  failOnPageErrors,
  getDiagramViaApi,
  loggedInContext,
  openDiagram,
  renameEntity,
  shareViaApi,
  type User,
} from "./support";

/**
 * Item 5 — Colaboração em tempo real com dois navegadores independentes,
 * cada um logado com uma conta diferente.
 */
test.describe("Colaboração em tempo real", () => {
  let owner: User;
  let editor: User;
  let diagramId: string;
  let ownerPage: Page;
  let editorPage: Page;
  let checks: (() => void)[];

  test.beforeEach(async ({ browser }) => {
    owner = await createUser("dona");
    editor = await createUser("editora");
    diagramId = await createDiagramViaApi(owner, "Colaboração E2E");
    await shareViaApi(owner, diagramId, editor, "EDITOR");

    ownerPage = await (await loggedInContext(browser, owner)).newPage();
    editorPage = await (await loggedInContext(browser, editor)).newPage();
    checks = [failOnPageErrors(ownerPage), failOnPageErrors(editorPage)];

    await openDiagram(ownerPage, diagramId);
    await openDiagram(editorPage, diagramId);
  });

  test.afterEach(async () => {
    checks.forEach((check) => check());
    await ownerPage.context().close();
    await editorPage.context().close();
  });

  test("cada usuário vê o avatar do outro, que some quando ele sai", async () => {
    await expect(avatar(ownerPage, editor.email)).toBeVisible();
    await expect(avatar(editorPage, owner.email)).toBeVisible();

    await editorPage.close();

    await expect(avatar(ownerPage, editor.email)).toHaveCount(0);
  });

  test("uma entidade criada por um aparece para o outro", async () => {
    await addEntity(ownerPage);

    await expect(entityNodes(ownerPage)).toHaveCount(1);
    await expect(entityNodes(editorPage)).toHaveCount(1);
  });

  test("renomear uma entidade propaga o novo nome", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);

    await renameEntity(editorPage, 0, "Cliente");

    await expect(entityNameInput(ownerPage)).toHaveValue("Cliente");
  });

  test("atributos configurados por um aparecem para o outro", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);

    await entityNodes(editorPage).first().getByRole("button", { name: "Configurar atributos" }).click();
    await editorPage.getByRole("button", { name: "+ Adicionar atributo" }).click();
    await editorPage.getByRole("button", { name: "Salvar", exact: true }).last().click();

    // O primeiro atributo criado é sempre a chave primária "id".
    await expect(entityNodes(ownerPage).first().getByText("id", { exact: true })).toBeVisible();
  });

  test("desfazer uma criação remove a entidade também para o outro usuário", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);

    await ownerPage.getByRole("button", { name: "Desfazer" }).click();

    await expect(entityNodes(ownerPage)).toHaveCount(0);
    await expect(entityNodes(editorPage)).toHaveCount(0);
  });

  test("edições concorrentes no mesmo nome convergem para o mesmo valor", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);

    await Promise.all([
      renameEntity(ownerPage, 0, "Nome da dona"),
      renameEntity(editorPage, 0, "Nome da editora"),
    ]);

    const names = async () => [
      await entityNameInput(ownerPage).inputValue(),
      await entityNameInput(editorPage).inputValue(),
    ];

    await expect.poll(async () => {
      const [a, b] = await names();
      return a === b && ["Nome da dona", "Nome da editora"].includes(a);
    }).toBe(true);
  });

  test("quem edita depois de ver a edição do outro vence", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);

    await renameEntity(ownerPage, 0, "Primeiro");
    await expect(entityNameInput(editorPage)).toHaveValue("Primeiro");

    await renameEntity(editorPage, 0, "Segundo");

    await expect(entityNameInput(editorPage)).toHaveValue("Segundo");
    await expect(entityNameInput(ownerPage)).toHaveValue("Segundo");
  });

  test("o cursor de um usuário aparece na tela do outro com o e-mail dele", async () => {
    const pane = ownerPage.locator(".react-flow__pane");
    const box = (await pane.boundingBox())!;

    await ownerPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await ownerPage.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 });

    await expect(editorPage.getByText(owner.email, { exact: true })).toBeVisible();
  });

  test("salvar persiste o diagrama editado por ambos", async () => {
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);
    await renameEntity(editorPage, 0, "Pedido");
    await expect(entityNameInput(ownerPage)).toHaveValue("Pedido");

    await ownerPage.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(ownerPage.getByText("Diagrama salvo com sucesso")).toBeVisible();

    const saved = await getDiagramViaApi(owner, diagramId);
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes[0].data.name).toBe("Pedido");

    await editorPage.reload();
    await expect(entityNameInput(editorPage)).toHaveValue("Pedido");
  });
});
