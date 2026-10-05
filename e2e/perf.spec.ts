import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  addEntity,
  createDiagramViaApi,
  createUser,
  entityNameInput,
  entityNodes,
  loggedInContext,
  openDiagram,
  shareViaApi,
} from "./support";

/**
 * Item 6 — Latência percebida de ponta a ponta (@perf).
 *
 * Mede o tempo entre a dona confirmar a renomeação de uma entidade (tecla
 * Enter no navegador A) e o novo nome aparecer na tela da editora
 * (navegador B). Os dois tempos são lidos no próprio navegador com
 * performance.timeOrigin + performance.now(), no mesmo relógio da máquina.
 * A detecção na tela B é feita a cada quadro (requestAnimationFrame), então
 * o resultado inclui a espera pelo próximo quadro, como o usuário percebe.
 *
 *   npm run test:e2e:perf
 */
const SAMPLES = Number(process.env.UI_LATENCY_SAMPLES ?? 40);

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const r2 = (v: number) => Math.round(v * 100) / 100;

test("@perf latência percebida de uma edição entre dois navegadores", async ({ browser }) => {
  test.setTimeout(180_000);

  const owner = await createUser("dona");
  const editor = await createUser("editora");
  const diagramId = await createDiagramViaApi(owner, "Latência");
  await shareViaApi(owner, diagramId, editor, "EDITOR");

  const ownerPage = await (await loggedInContext(browser, owner)).newPage();
  const editorPage = await (await loggedInContext(browser, editor)).newPage();
  await openDiagram(ownerPage, diagramId);
  await openDiagram(editorPage, diagramId);
  await addEntity(ownerPage);
  await expect(entityNodes(editorPage)).toHaveCount(1);

  await ownerPage.evaluate(() => {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") (window as unknown as { __sentAt: number }).__sentAt = performance.timeOrigin + performance.now();
      },
      true,
    );
  });

  const latencies: number[] = [];
  const ownerInput = entityNameInput(ownerPage);

  for (let i = 0; i < SAMPLES; i++) {
    const name = `tabela_${i}`;
    await ownerInput.click();
    await ownerInput.fill(name);

    const seen = editorPage.waitForFunction(
      (expected) => {
        const input = document.querySelector<HTMLInputElement>(".react-flow__node-entityNode .ant-card-head input");
        return input?.value === expected ? performance.timeOrigin + performance.now() : false;
      },
      name,
      { polling: "raf", timeout: 10_000 },
    );

    await ownerInput.press("Enter");
    const seenAt = (await (await seen).jsonValue()) as number;
    const sentAt = await ownerPage.evaluate(() => (window as unknown as { __sentAt: number }).__sentAt);

    latencies.push(seenAt - sentAt);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const summary = {
    date: new Date().toISOString(),
    samples: SAMPLES,
    mean: r2(sorted.reduce((s, v) => s + v, 0) / sorted.length),
    p50: r2(pct(sorted, 50)),
    p95: r2(pct(sorted, 95)),
    max: r2(sorted[sorted.length - 1]),
    latenciesMs: latencies.map(r2),
  };

  mkdirSync("reports/perf", { recursive: true });
  writeFileSync("reports/perf/ui-latency.json", JSON.stringify(summary, null, 2));
  writeFileSync(
    "reports/perf/ui-latency.md",
    [
      "# Latência percebida entre dois navegadores",
      "",
      `Gerado por \`npm run test:e2e:perf\` em ${summary.date}. ${SAMPLES} renomeações de entidade.`,
      "",
      "| Média (ms) | p50 (ms) | p95 (ms) | Máximo (ms) |",
      "|---|---|---|---|",
      `| ${summary.mean} | ${summary.p50} | ${summary.p95} | ${summary.max} |`,
      "",
      "Medido com o servidor de desenvolvimento do Vite (React em modo de desenvolvimento); em produção tende a ser menor.",
      "",
      "Inclui: evento no navegador A, aplicação no store, envio pelo socket, repasse no gateway,",
      "aplicação no store do navegador B, nova renderização do React e o próximo quadro desenhado.",
      "",
    ].join("\n"),
  );

  console.log(`Latência percebida: p50=${summary.p50}ms p95=${summary.p95}ms máx=${summary.max}ms`);

  // Critério de aceitação: a edição aparece para o outro usuário em menos de 200 ms (p95).
  expect(summary.p95).toBeLessThan(200);
});
