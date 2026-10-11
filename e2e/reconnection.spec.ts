import { expect, test, type WebSocketRoute } from "@playwright/test";
import {
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

test("as edições feitas com a conexão caída chegam nos dois lados quando ela volta", async ({ browser }) => {
  const owner = await createUser("dona");
  const editor = await createUser("editora");
  const diagramId = await createDiagramViaApi(owner, "Reconexão E2E");
  await shareViaApi(owner, diagramId, editor, "EDITOR");

  const ownerPage = await (await loggedInContext(browser, owner)).newPage();
  const editorContext = await loggedInContext(browser, editor);
  const editorPage = await editorContext.newPage();
  const checks = [failOnPageErrors(ownerPage), failOnPageErrors(editorPage)];

  const editorSockets: WebSocketRoute[] = [];
  await editorPage.routeWebSocket(/socket\.io/, (ws) => {
    editorSockets.push(ws);
    ws.connectToServer();
  });

  await openDiagram(ownerPage, diagramId);
  await openDiagram(editorPage, diagramId);

  const editorStatus = editorPage.locator("[data-connection-status]");
  await expect(editorStatus).toHaveAttribute("data-connection-status", "connected");

  await addEntity(ownerPage);
  await expect(entityNodes(editorPage)).toHaveCount(1);

  await editorContext.setOffline(true);
  await Promise.all(editorSockets.map((ws) => ws.close()));
  await expect(editorStatus).toHaveAttribute("data-connection-status", "reconnecting");

  await renameEntity(editorPage, 0, "EditadaOffline");
  await expect(editorStatus).toContainText("1 alteração aguardando");

  await addEntity(ownerPage);
  await expect(entityNodes(ownerPage)).toHaveCount(2);
  await expect(entityNodes(editorPage)).toHaveCount(1);

  await editorContext.setOffline(false);
  await expect(editorStatus).toHaveAttribute("data-connection-status", "connected", { timeout: 15_000 });
  await expect(editorStatus).not.toContainText("aguardando");

  await expect(entityNodes(editorPage)).toHaveCount(2);
  await expect(entityNameInput(ownerPage, 0)).toHaveValue("EditadaOffline");

  checks.forEach((check) => check());
});
