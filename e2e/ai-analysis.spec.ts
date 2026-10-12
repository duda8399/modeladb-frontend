import { expect, request, test, type Page } from "@playwright/test";
import {
  BACKEND_URL,
  createDiagramViaApi,
  createUser,
  entityNodes,
  failOnPageErrors,
  loggedInContext,
  openDiagram,
  shareViaApi,
  type User,
  chooseMoreOption,
} from "./support";

const SQL = `
CREATE TABLE produto (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, preco FLOAT);
CREATE TABLE pedido (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  produto_id INT,
  FOREIGN KEY (produto_id) REFERENCES produto(id)
);
`;

const nullAction = {
  column: null, newName: null, dataType: null, size: null, flag: null, value: null,
  columns: null, expression: null, defaultValue: null, onDelete: null, onUpdate: null,
};

const ANALYSIS = {
  score: 58,
  summary: "Modelo pequeno e coerente, mas com tipos e índices a melhorar.",
  suggestions: [
    {
      id: "s-baixa", category: "modelagem", severity: "baixa", title: "Considere uma tabela de categorias",
      description: "Produtos costumam ser agrupados.", table: null, column: null, action: null,
    },
    {
      id: "s-indice", category: "desempenho", severity: "media", title: "Indexe a chave estrangeira",
      description: "Consultas por produto ficam mais rápidas.", table: "pedido", column: "produto_id",
      action: { ...nullAction, type: "add_index", table: "pedido", columns: ["produto_id"], value: false },
    },
    {
      id: "s-preco", category: "tipos", severity: "alta", title: "Use DECIMAL para preço",
      description: "FLOAT perde precisão em valores monetários.", table: "produto", column: "preco",
      action: { ...nullAction, type: "set_column_type", table: "produto", column: "preco", dataType: "DECIMAL", size: "10,2" },
    },
  ],
};

async function saveOpenAIKey(user: User) {
  const api = await request.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { Authorization: `Bearer ${user.token}` } });
  expect((await api.put(`/user/${user.id}`, { multipart: { openaiToken: "sk-teste-e2e" } })).ok()).toBe(true);
  await api.dispose();
}

async function importSql(page: Page, sql: string) {
  await chooseMoreOption(page, "Importar");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "m.sql", mimeType: "application/sql", buffer: Buffer.from(sql) });
}

const entity = (page: Page, name: string) => entityNodes(page).filter({ has: page.locator(`input[value="${name}"]`) });

test("a IA analisa o modelo e as sugestões são aplicadas e sincronizadas", async ({ browser }) => {
  const owner = await createUser("analise");
  const editor = await createUser("semchave");
  await saveOpenAIKey(owner);
  const diagramId = await createDiagramViaApi(owner, "Para analisar");
  await shareViaApi(owner, diagramId, editor, "EDITOR");

  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);
  await importSql(page, SQL);
  await expect(entityNodes(page)).toHaveCount(2);
  await expect(page.getByText(/Salvo às/)).toBeVisible({ timeout: 15_000 });

  const editorPage = await (await loggedInContext(browser, editor)).newPage();
  await openDiagram(editorPage, diagramId);
  await expect(entityNodes(editorPage)).toHaveCount(2);

  let sentBody: { nodes: unknown[]; edges: unknown[]; focus: string } | null = null;
  await page.route("**/openai/analyze-diagram", async (route) => {
    sentBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(ANALYSIS) });
  });

  await page.getByRole("button", { name: "Analisar modelo" }).click();
  const drawer = page.locator(".ant-drawer").filter({ hasText: "Análise da IA" });
  await drawer.getByLabel("Foco da análise").fill("tipos de dados");
  await drawer.getByRole("button", { name: "Analisar modelo" }).click();

  await expect(drawer.getByTestId("ai-score")).toHaveText("58");
  await expect(drawer).toContainText("Modelo pequeno e coerente");
  expect(sentBody!.focus).toBe("tipos de dados");
  expect(sentBody!.nodes).toHaveLength(2);

  const suggestions = drawer.getByTestId("ai-suggestion");
  await expect(suggestions).toHaveCount(3);
  await expect(suggestions.nth(0)).toContainText("Use DECIMAL para preço");
  await expect(suggestions.nth(1)).toContainText("Indexe a chave estrangeira");
  await expect(suggestions.nth(2)).not.toContainText("Aplicar");

  await suggestions.nth(0).getByRole("button", { name: "Aplicar" }).click();
  await expect(entity(page, "produto")).toContainText("DECIMAL(10,2)");
  await expect(entity(editorPage, "produto")).toContainText("DECIMAL(10,2)");
  await expect(suggestions.nth(0).getByRole("button", { name: "Aplicada" })).toBeDisabled();

  await suggestions.nth(1).getByRole("button", { name: "Aplicar" }).click();
  await expect(entity(page, "pedido").getByTestId("entity-indexes")).toContainText("idx_pedido_produto_id (produto_id)");
  await expect(entity(editorPage, "pedido").getByTestId("entity-indexes")).toContainText("idx_pedido_produto_id");

  await suggestions.nth(2).getByRole("button", { name: "Ignorar" }).click();
  await expect(suggestions).toHaveCount(2);
  await drawer.getByRole("button", { name: "Mostrar 1 sugestão ignorada" }).click();
  await expect(suggestions).toHaveCount(3);

  await suggestions.nth(0).getByRole("button", { name: "produto.preco" }).click();

  await drawer.locator(".ant-drawer-close").click();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(entity(page, "pedido").getByTestId("entity-indexes")).toHaveCount(0);
  await expect(entity(editorPage, "pedido").getByTestId("entity-indexes")).toHaveCount(0);

  await editorPage.getByRole("button", { name: "Analisar modelo" }).click();
  await expect(editorPage.getByText("Configurar chave de API da OpenAI")).toBeVisible();

  assertNoErrors();
});
