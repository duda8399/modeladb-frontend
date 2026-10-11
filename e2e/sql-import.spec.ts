import { expect, test } from "@playwright/test";
import {
  createDiagramViaApi,
  createUser,
  entityNameInput,
  entityNodes,
  failOnPageErrors,
  getDiagramViaApi,
  loggedInContext,
  openDiagram,
} from "./support";

const LOJA_SQL = `
-- Gerado à mão, estilo MySQL
CREATE TABLE cliente (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE pedido (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  criado_em DATETIME NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES cliente(id)
);

CREATE TABLE produto (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  preco DECIMAL(10,2)
);

CREATE TABLE pedido_produto (
  fk_pedido_id INT NOT NULL REFERENCES pedido(id),
  fk_produto_id INT NOT NULL REFERENCES produto(id),
  PRIMARY KEY (fk_pedido_id, fk_produto_id)
);
`;

test("importar um .sql cria as entidades e os relacionamentos no canvas", async ({ browser }) => {
  const owner = await createUser("sql");
  const diagramId = await createDiagramViaApi(owner, "Loja importada");
  const page = await (await loggedInContext(browser, owner)).newPage();
  const assertNoErrors = failOnPageErrors(page);
  await openDiagram(page, diagramId);

  await page.getByRole("button", { name: "Importar" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Continuar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "loja.sql", mimeType: "application/sql", buffer: Buffer.from(LOJA_SQL) });

  await expect(page.getByText("SQL importado: 4 tabelas e 2 relacionamentos")).toBeVisible();
  await expect(entityNodes(page)).toHaveCount(4);

  const names = await Promise.all([0, 1, 2, 3].map((i) => entityNameInput(page, i).inputValue()));
  expect(names.sort()).toEqual(["cliente", "pedido", "pedido_produto", "produto"]);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  await page.screenshot({ path: process.env.SQL_IMPORT_SHOT || "test-results/sql-import.png" });

  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await getDiagramViaApi(owner, diagramId)).nodes?.length)
    .toBe(4);
  const saved = await getDiagramViaApi(owner, diagramId);
  expect(saved.edges).toHaveLength(3);
  assertNoErrors();
});
