import { expect, test, type Browser, type Page } from "@playwright/test";
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
 * Mede o tempo entre a dona realizar uma edição no navegador A e o resultado
 * aparecer na tela da editora (navegador B), para quatro tipos de operação:
 * renomear, mover (arrastar), criar e remover (desfazer a criação) uma entidade.
 * Os dois tempos são lidos no próprio navegador com
 * performance.timeOrigin + performance.now(), no mesmo relógio da máquina.
 * A detecção na tela B é feita a cada quadro (requestAnimationFrame), então
 * o resultado inclui a espera pelo próximo quadro, como o usuário percebe.
 *
 *   npm run test:e2e:perf
 *   UI_LATENCY_SAMPLES=250 UI_LATENCY_RUNS=5 UI_LATENCY_WARMUP=10 npm run test:e2e:perf
 */
const SAMPLES = Number(process.env.UI_LATENCY_SAMPLES ?? 125);
const RUNS = Math.max(1, Number(process.env.UI_LATENCY_RUNS ?? 3));
const WARMUP = Math.max(0, Number(process.env.UI_LATENCY_WARMUP ?? 5));
const LIMIT_P95_MS = 200;

const OPERATIONS = ["renomear", "mover", "criar", "remover"] as const;
type Operation = (typeof OPERATIONS)[number];

const LABELS: Record<Operation, string> = {
  renomear: "Renomear entidade (SET_NODE_PROP)",
  mover: "Mover entidade (MOVE_NODE)",
  criar: "Criar entidade (ADD_NODE)",
  remover: "Remover entidade com desfazer (DELETE_NODE)",
};

type Sample = { run: number; cycle: number; operation: Operation; latencyMs: number };
type Trigger = "keydown" | "pointerup" | "click";
type Condition = { kind: "name" | "transform" | "count"; value: string };

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];

function quantileCi(sorted: number[], p: number) {
  const n = sorted.length;
  const q = p / 100;
  const half = 1.96 * Math.sqrt(n * q * (1 - q));
  const low = Math.max(1, Math.floor(n * q - half));
  const high = Math.min(n, Math.ceil(n * q + half));
  return { low: r2(sorted[low - 1]), high: r2(sorted[high - 1]), upperIsMax: high === n };
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    n,
    mean: r2(mean),
    sd: r2(sd),
    min: r2(sorted[0]),
    p50: r2(pct(sorted, 50)),
    p95: r2(pct(sorted, 95)),
    p95Ci95: quantileCi(sorted, 95),
    p99: r2(pct(sorted, 99)),
    max: r2(sorted[n - 1]),
  };
}

function spread(values: number[]) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    mean: r2(mean),
    sd: r2(sd),
    cvPercent: mean ? r2((sd / mean) * 100) : 0,
    min: r2(Math.min(...values)),
    max: r2(Math.max(...values)),
  };
}

async function installTriggerListener(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __expect: string | null; __sentAt: number | null };
    const record = (e: Event) => {
      if (w.__expect !== e.type) return;
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Enter") return;
      w.__sentAt = performance.timeOrigin + performance.now();
      w.__expect = null;
    };
    for (const type of ["keydown", "pointerup", "click"]) document.addEventListener(type, record, true);
  });
}

async function arm(page: Page, trigger: Trigger) {
  await page.evaluate((type) => {
    const w = window as unknown as { __expect: string | null; __sentAt: number | null };
    w.__sentAt = null;
    w.__expect = type;
  }, trigger);
}

function waitSeen(page: Page, condition: Condition) {
  return page.waitForFunction(
    ({ kind, value }) => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node-entityNode"));
      let ok: boolean;
      if (kind === "name") ok = nodes[0]?.querySelector<HTMLInputElement>(".ant-card-head input")?.value === value;
      else if (kind === "transform") ok = !!nodes[0] && nodes[0].style.transform !== value;
      else ok = nodes.length === Number(value);
      return ok ? performance.timeOrigin + performance.now() : false;
    },
    condition,
    { polling: "raf", timeout: 10_000 },
  );
}

async function perform(operation: Operation, ownerPage: Page, editorPage: Page, run: number, cycle: number) {
  let seen: ReturnType<typeof waitSeen>;

  if (operation === "renomear") {
    const name = `tabela_${run}_${cycle}`;
    const input = entityNameInput(ownerPage);
    await input.click();
    await input.fill(name);
    await arm(ownerPage, "keydown");
    seen = waitSeen(editorPage, { kind: "name", value: name });
    await input.press("Enter");
  } else if (operation === "mover") {
    const before = await editorPage.evaluate(
      () => document.querySelector<HTMLElement>(".react-flow__node-entityNode")?.style.transform ?? "",
    );
    const box = (await entityNodes(ownerPage).first().locator(".ant-card-body").boundingBox())!;
    const direction = cycle % 2 === 0 ? 1 : -1;
    await ownerPage.mouse.move(box.x + 20, box.y + box.height / 2);
    await ownerPage.mouse.down();
    await ownerPage.mouse.move(box.x + 20 + 120 * direction, box.y + box.height / 2 + 10 * direction, { steps: 5 });
    await arm(ownerPage, "pointerup");
    seen = waitSeen(editorPage, { kind: "transform", value: before });
    await ownerPage.mouse.up();
  } else if (operation === "criar") {
    await arm(ownerPage, "click");
    seen = waitSeen(editorPage, { kind: "count", value: "2" });
    await addEntity(ownerPage);
  } else {
    await arm(ownerPage, "click");
    seen = waitSeen(editorPage, { kind: "count", value: "1" });
    await ownerPage.getByRole("button", { name: "Desfazer" }).click();
  }

  const seenAt = (await (await seen).jsonValue()) as number;
  const sentAt = await ownerPage.evaluate(() => (window as unknown as { __sentAt: number | null }).__sentAt);
  if (sentAt == null) throw new Error(`gatilho de "${operation}" não foi registrado no navegador A`);
  if (operation === "criar" || operation === "remover") {
    await expect(entityNodes(ownerPage)).toHaveCount(operation === "criar" ? 2 : 1);
  }
  return seenAt - sentAt;
}

async function runOnce(browser: Browser, run: number): Promise<Sample[]> {
  const owner = await createUser(`dona${run}`);
  const editor = await createUser(`editora${run}`);
  const diagramId = await createDiagramViaApi(owner, `Latência ${run}`);
  await shareViaApi(owner, diagramId, editor, "EDITOR");

  const ownerContext = await loggedInContext(browser, owner);
  const editorContext = await loggedInContext(browser, editor);
  try {
    const ownerPage = await ownerContext.newPage();
    const editorPage = await editorContext.newPage();
    await openDiagram(ownerPage, diagramId);
    await openDiagram(editorPage, diagramId);
    await addEntity(ownerPage);
    await expect(entityNodes(editorPage)).toHaveCount(1);
    await installTriggerListener(ownerPage);

    const samples: Sample[] = [];
    for (let cycle = -WARMUP; cycle < SAMPLES; cycle++) {
      for (const operation of OPERATIONS) {
        const latencyMs = await perform(operation, ownerPage, editorPage, run, cycle);
        if (cycle >= 0) samples.push({ run, cycle, operation, latencyMs });
      }
    }
    return samples;
  } finally {
    await ownerContext.close();
    await editorContext.close();
  }
}

test("@perf latência percebida de edições entre dois navegadores", async ({ browser }) => {
  test.setTimeout(120_000 + RUNS * (SAMPLES + WARMUP) * OPERATIONS.length * 2_000);

  const samples: Sample[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const runSamples = await runOnce(browser, run);
    samples.push(...runSamples);
    const p95s = OPERATIONS.map((op) => {
      const values = runSamples.filter((s) => s.operation === op).map((s) => s.latencyMs);
      return `${op} p95=${r2(pct([...values].sort((a, b) => a - b), 95))}ms`;
    });
    console.log(`Execução ${run}/${RUNS}: ${p95s.join(" | ")}`);
  }

  const groups: (Operation | "todas")[] = [...OPERATIONS, "todas"];
  const byOperation = Object.fromEntries(
    groups.map((group) => {
      const selected = samples.filter((s) => group === "todas" || s.operation === group);
      const perRun = Array.from({ length: RUNS }, (_, i) =>
        summarize(selected.filter((s) => s.run === i + 1).map((s) => s.latencyMs)),
      );
      return [
        group,
        {
          pooled: summarize(selected.map((s) => s.latencyMs)),
          perRun,
          p50AcrossRuns: spread(perRun.map((r) => r.p50)),
          p95AcrossRuns: spread(perRun.map((r) => r.p95)),
        },
      ];
    }),
  ) as Record<Operation | "todas", { pooled: ReturnType<typeof summarize>; perRun: ReturnType<typeof summarize>[]; p50AcrossRuns: ReturnType<typeof spread>; p95AcrossRuns: ReturnType<typeof spread> }>;

  const summary = {
    date: new Date().toISOString(),
    runs: RUNS,
    samplesPerOperationPerRun: SAMPLES,
    warmupCyclesDiscardedPerRun: WARMUP,
    totalSamples: samples.length,
    operations: byOperation,
  };

  mkdirSync("reports/perf", { recursive: true });
  writeFileSync("reports/perf/ui-latency.json", JSON.stringify(summary, null, 2));
  writeFileSync(
    "reports/perf/ui-latency-amostras.csv",
    [
      "execucao,ciclo,operacao,latencia_ms",
      ...samples.map((s) => `${s.run},${s.cycle},${s.operation},${r2(s.latencyMs)}`),
    ].join("\n"),
  );

  const label = (group: Operation | "todas") => (group === "todas" ? "**Todas as operações**" : LABELS[group]);
  const ci = (d: ReturnType<typeof summarize>) =>
    `[${d.p95Ci95.low}; ${d.p95Ci95.high}${d.p95Ci95.upperIsMax ? "*" : ""}]`;

  writeFileSync(
    "reports/perf/ui-latency.md",
    [
      "# Latência percebida entre dois navegadores",
      "",
      `Gerado por \`npm run test:e2e:perf\` em ${summary.date}.`,
      "",
      `${RUNS} execuções independentes (usuários, diagrama e navegadores novos em cada uma). ` +
        `Em cada execução, ${SAMPLES} ciclos de quatro operações intercaladas (renomear, mover, criar, remover), ` +
        `após ${WARMUP} ciclos de aquecimento descartados. Total: ${samples.length} amostras ` +
        `(${SAMPLES * RUNS} por operação).`,
      "",
      "## Todas as amostras agrupadas",
      "",
      "| Operação | Amostras | Média ± dp (ms) | p50 (ms) | p95 (ms) | IC 95% do p95 (ms) | p99 (ms) | Máximo (ms) |",
      "|---|---|---|---|---|---|---|---|",
      ...groups.map((group) => {
        const d = byOperation[group].pooled;
        return `| ${label(group)} | ${d.n} | ${d.mean} ± ${d.sd} | ${d.p50} | ${d.p95} | ${ci(d)} | ${d.p99} | ${d.max} |`;
      }),
      "",
      "O IC 95% do p95 é não paramétrico (estatísticas de ordem, aproximação normal da binomial). " +
        "\\* indica que o limite superior coincide com o máximo da amostra.",
      "",
      "## Variação entre execuções",
      "",
      "Cada execução contribui com um p50 e um p95; a tabela mostra média ± desvio padrão, coeficiente de variação e faixa desses valores.",
      "",
      "| Operação | p50 entre execuções (ms) | p95 entre execuções (ms) | CV do p95 | p95 mín–máx (ms) |",
      "|---|---|---|---|---|",
      ...groups.map((group) => {
        const { p50AcrossRuns: a, p95AcrossRuns: b } = byOperation[group];
        return `| ${label(group)} | ${a.mean} ± ${a.sd} | ${b.mean} ± ${b.sd} | ${b.cvPercent}% | ${b.min}–${b.max} |`;
      }),
      "",
      "Medido com o servidor de desenvolvimento do Vite (React em modo de desenvolvimento); em produção tende a ser menor.",
      "",
      "Inclui: evento no navegador A, aplicação no store, envio pelo socket, repasse no gateway,",
      "aplicação no store do navegador B, nova renderização do React e o próximo quadro desenhado.",
      "O instante inicial é o Enter (renomear), o fim do arraste (mover) ou o clique no botão (criar e desfazer).",
      "As amostras individuais estão em `ui-latency-amostras.csv`.",
      "",
    ].join("\n"),
  );

  for (const group of groups) {
    const d = byOperation[group].pooled;
    console.log(`${group}: n=${d.n} p50=${d.p50}ms p95=${d.p95}ms ${ci(d)} p99=${d.p99}ms máx=${d.max}ms`);
  }

  // Critério de aceitação: cada tipo de edição aparece para o outro usuário em menos de 200 ms (p95).
  for (const operation of OPERATIONS) {
    expect(byOperation[operation].pooled.p95, LABELS[operation]).toBeLessThan(LIMIT_P95_MS);
  }
});
