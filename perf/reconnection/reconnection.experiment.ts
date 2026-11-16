import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import type { Operation, OperationDraft } from "../../src/stores/diagramCollabStore";
import { Backend, login, registerUser, request, type User } from "./backend";
import { createLink, type NetworkLink } from "./proxy";
import { createStore, hasKey, sharedEntity, SimClient, visibleState, type Mode, type VisibleState } from "./client";
import { dispersion, round, type Dispersion } from "./stats";

const list = (value: string | undefined, fallback: string) =>
  (value ?? fallback)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const PORT = Number(process.env.RECONN_PORT ?? 3121);
const REPEATS = Math.max(1, Number(process.env.RECONN_REPEATS ?? 10));
const SCENARIOS = new Set(list(process.env.RECONN_SCENARIOS, "duracao,concorrencia,reinicio"));
const DURATIONS_MS = list(process.env.RECONN_DURATIONS_MS, "1000,5000,15000,30000").map(Number);
const BASE_RATE = Number(process.env.RECONN_BASE_RATE ?? 2);
const RATES = list(process.env.RECONN_RATES, "1,5,20").map(Number);
const RATE_DURATION_MS = Number(process.env.RECONN_RATE_DURATION_MS ?? 5000);
const RESTART_EXTRA_MS = list(process.env.RECONN_RESTART_EXTRA_MS, "0,10000").map(Number);
const MODES: Mode[] = ["sem_mecanismo", "mecanismo_original", "mecanismo_corrigido"];
const PRE_EDIT_MS = 1000;
const REJOIN_TIMEOUT_MS = 45_000;
const CONVERGENCE_GRACE_MS = 5000;
const SETTLE_MS = 3500;
const OUT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../reports/perf");
const RESUME = process.env.RECONN_RESUME === "1";
const MAX_ATTEMPTS = 3;
const CLOCK_DRIFT_LIMIT_MS = 3000;
const SHARED_IDS = ["compartilhada-1", "compartilhada-2", "compartilhada-3"];

type ScenarioKind = "duracao" | "concorrencia" | "reinicio";

type RunConfig = {
  scenario: ScenarioKind;
  mode: Mode;
  outageMs: number;
  ratePerClient: number;
  restartExtraMs: number;
  repetition: number;
};

type RunResult = RunConfig & {
  opsTotal: number;
  opsDuringOutage: number;
  offlineOpsDisconnected: number;
  keysTotal: number;
  lostPerClient: Record<string, number>;
  lostByOrigin: Record<string, Record<string, number>>;
  ownLost: number;
  lostAnyClient: number;
  lossRateClients: number;
  lostPersisted: number;
  lossRatePersisted: number;
  converged: boolean;
  persistedMatchesOracle: boolean;
  actualOutageMs: number;
  reconnectMs: number | null;
  recoveryMs: number | null;
  pendingAtRestore: number;
  serverBootMs: number | null;
  resyncs: number;
  savesFailed: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = () => Math.random().toString(36).slice(2, 8);

let backend: Backend;
let users: User[] = [];

function draftFor(client: SimClient): { draft: OperationDraft; key?: string } {
  const roll = Math.random();
  const shared = SHARED_IDS[Math.floor(Math.random() * SHARED_IDS.length)];

  if (roll < 0.4) {
    const id = crypto.randomUUID();
    return {
      key: `node:${id}`,
      draft: {
        type: "ADD_NODE",
        targetId: id,
        payload: {
          id,
          type: "entityNode",
          position: { x: Math.round(Math.random() * 2000), y: Math.round(200 + Math.random() * 2000) },
          data: {
            name: `E_${client.label}_${short()}`,
            fields: [{ id: `${id}-pk`, name: "id", type: "INT", pk: true, fk: false, notNull: true, unique: true, ai: true, order: 0 }],
          },
        },
      },
    };
  }

  if (roll < 0.8) {
    const id = crypto.randomUUID();
    const order = client.getNode(shared)?.data.fields?.length ?? 1;
    return {
      key: `field:${shared}:${id}`,
      draft: {
        type: "ADD_FIELD",
        targetId: shared,
        payload: { id, name: `c_${client.label}_${short()}`, type: "VARCHAR", pk: false, fk: false, notNull: false, unique: false, ai: false, order },
      },
    };
  }

  const node = client.getNode(shared);
  return {
    draft: {
      type: "MOVE_NODE",
      targetId: shared,
      payload: { x: Math.round(Math.random() * 1500), y: Math.round(Math.random() * 1500) },
      previousPosition: node ? { ...node.position } : undefined,
    },
  };
}

type Ledger = { ops: Operation[]; keys: string[]; origins: string[]; times: number[] };

function startEditors(clients: SimClient[], ratePerClient: number, ledger: Ledger) {
  const interval = 1000 / ratePerClient;
  const timers = clients.map((client) => {
    let tick: ReturnType<typeof setInterval> | undefined;
    const tickOnce = () => {
      const { draft, key } = draftFor(client);
      const op = client.edit(draft);
      if (!op) return;
      ledger.ops.push(structuredClone(op));
      ledger.times.push(performance.now());
      if (key) {
        ledger.keys.push(key);
        ledger.origins.push(client.label);
      }
    };
    const start = setTimeout(() => {
      tickOnce();
      tick = setInterval(tickOnce, interval);
    }, Math.random() * interval);
    return () => {
      clearTimeout(start);
      if (tick) clearInterval(tick);
    };
  });
  return () => timers.forEach((stop) => stop());
}

async function prepareDiagram(owner: User, others: User[]) {
  const diagram = await request<{ id: string }>(backend.url, "POST", "/diagram/create", { name: "Reconexão" }, owner.token);
  await request(
    backend.url,
    "PUT",
    `/diagram/${diagram.id}`,
    {
      name: "Reconexão",
      nodes: SHARED_IDS.map((id, i) => sharedEntity(id, `Compartilhada${i + 1}`, i * 400)),
      edges: [],
    },
    owner.token,
  );
  for (const user of others) {
    await request(backend.url, "POST", `/diagram/${diagram.id}/collaborators`, { email: user.email, role: "EDITOR" }, owner.token);
  }
  return diagram.id;
}

async function oracleState(ledger: Ledger): Promise<VisibleState> {
  const store = await createStore();
  store.getState().loadDocument(
    SHARED_IDS.map((id, i) => sharedEntity(id, `Compartilhada${i + 1}`, i * 400)),
    [],
  );
  for (const op of ledger.ops) store.getState().applyOperation(structuredClone(op), false);
  return visibleState(store.getState().nodes as never);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, stepMs = 10) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return performance.now();
    await sleep(stepMs);
  }
  return predicate() ? performance.now() : null;
}

async function runOnce(config: RunConfig): Promise<RunResult> {
  users = await Promise.all(users.map((u) => login(backend.url, u)));
  const [ana, bruno, carla] = users;
  const diagramId = await prepareDiagram(bruno, [ana, carla]);

  const link: NetworkLink = await createLink(PORT);
  const linkUrl = `http://127.0.0.1:${link.port}`;
  const clients = [
    new SimClient("ana", ana, config.mode, linkUrl, diagramId),
    new SimClient("bruno", bruno, config.mode, backend.url, diagramId),
    new SimClient("carla", carla, config.mode, backend.url, diagramId),
  ];

  try {
    for (const client of clients) await client.start();
    await sleep(300);

    const ledger: Ledger = { ops: [], keys: [], origins: [], times: [] };
    const [disconnected] = clients;
    const affected = config.scenario === "reinicio" ? clients : [disconnected];
    const stopEditing = startEditors(clients, config.ratePerClient, ledger);

    await sleep(PRE_EDIT_MS);

    const cutAt = performance.now();
    let serverBootMs: number | null = null;
    let restoredAt: number;

    if (config.scenario === "reinicio") {
      await backend.killServer();
      if (config.restartExtraMs > 0) await sleep(config.restartExtraMs);
      const started = await backend.startServer();
      serverBootMs = round(started.bootMs);
      restoredAt = started.readyAt;
    } else {
      link.cut();
      await sleep(config.outageMs);
      link.restore();
      restoredAt = performance.now();
    }

    stopEditing();
    const pendingAtRestore = disconnected.pendingCount();
    const opsDuringOutage = ledger.times.filter((t) => t >= cutAt && t <= restoredAt).length;
    const offlineOpsDisconnected = ledger.ops.filter(
      (op, i) => op.userId === disconnected.user.id && ledger.times[i] >= cutAt && ledger.times[i] <= restoredAt,
    ).length;

    const oracle = await oracleState(ledger);
    const oracleJson = JSON.stringify(oracle);

    const rejoinedAt = await waitFor(() => affected.every((c) => c.joinedAt > cutAt), REJOIN_TIMEOUT_MS);
    const convergedAt = rejoinedAt
      ? await waitFor(
          () => clients.every((c) => JSON.stringify(c.visible()) === oracleJson),
          Math.max(0, rejoinedAt + CONVERGENCE_GRACE_MS - performance.now()),
        )
      : null;

    await sleep(SETTLE_MS);
    await Promise.all(clients.map((c) => c.idle()));

    const finalStates = clients.map((c) => c.visible());
    const keys = ledger.keys;
    const lostPerClient = Object.fromEntries(
      clients.map((c, i) => [c.label, keys.filter((k) => !hasKey(finalStates[i], k)).length]),
    );
    const lostByOrigin = Object.fromEntries(
      clients.map((c, i) => [
        c.label,
        Object.fromEntries(
          clients.map((o) => [o.label, keys.filter((k, j) => ledger.origins[j] === o.label && !hasKey(finalStates[i], k)).length]),
        ),
      ]),
    );
    const lostAnyClient = keys.filter((k) => finalStates.some((s) => !hasKey(s, k))).length;

    const persistedDoc = await request<{ nodes: never[] }>(backend.url, "GET", `/diagram/${diagramId}`, undefined, bruno.token);
    const persisted = visibleState(persistedDoc.nodes ?? []);
    const lostPersisted = keys.filter((k) => !hasKey(persisted, k)).length;
    const totalLostClients = Object.values(lostPerClient).reduce((s, v) => s + v, 0);

    return {
      ...config,
      opsTotal: ledger.ops.length,
      opsDuringOutage,
      offlineOpsDisconnected,
      keysTotal: keys.length,
      lostPerClient,
      lostByOrigin,
      ownLost: clients.reduce((sum, c) => sum + lostByOrigin[c.label][c.label], 0),
      lostAnyClient,
      lossRateClients: keys.length ? round(totalLostClients / (keys.length * clients.length), 4) : 0,
      lostPersisted,
      lossRatePersisted: keys.length ? round(lostPersisted / keys.length, 4) : 0,
      converged: finalStates.every((s) => JSON.stringify(s) === oracleJson),
      persistedMatchesOracle: JSON.stringify(persisted) === oracleJson,
      actualOutageMs: round(restoredAt - cutAt),
      reconnectMs: rejoinedAt ? round(Math.max(0, rejoinedAt - restoredAt)) : null,
      recoveryMs: convergedAt ? round(Math.max(0, convergedAt - restoredAt)) : null,
      pendingAtRestore,
      serverBootMs,
      resyncs: clients.reduce((s, c) => s + c.resyncs, 0),
      savesFailed: clients.reduce((s, c) => s + c.savesFailed, 0),
    };
  } finally {
    clients.forEach((c) => {
      try {
        c.stop();
      } catch {
        return;
      }
    });
    await link.close();
    await sleep(200);
  }
}

function plan(): RunConfig[] {
  const configs: RunConfig[] = [];
  const push = (base: Omit<RunConfig, "mode" | "repetition">) => {
    for (let repetition = 1; repetition <= REPEATS; repetition++) {
      for (const mode of MODES) configs.push({ ...base, mode, repetition });
    }
  };
  if (SCENARIOS.has("duracao")) {
    for (const outageMs of DURATIONS_MS) push({ scenario: "duracao", outageMs, ratePerClient: BASE_RATE, restartExtraMs: 0 });
  }
  if (SCENARIOS.has("concorrencia")) {
    for (const ratePerClient of RATES) push({ scenario: "concorrencia", outageMs: RATE_DURATION_MS, ratePerClient, restartExtraMs: 0 });
  }
  if (SCENARIOS.has("reinicio")) {
    for (const restartExtraMs of RESTART_EXTRA_MS) push({ scenario: "reinicio", outageMs: 0, ratePerClient: BASE_RATE, restartExtraMs });
  }
  return configs;
}

type Group = {
  scenario: ScenarioKind;
  mode: Mode;
  outageMs: number;
  ratePerClient: number;
  restartExtraMs: number;
  runs: RunResult[];
};

const SUMMARY_METRICS: [string, (r: RunResult) => number | null][] = [
  ["ops_total", (r) => r.opsTotal],
  ["ops_durante_falha", (r) => r.opsDuringOutage],
  ["taxa_perda_clientes", (r) => r.lossRateClients],
  ["ops_perdidas_algum_cliente", (r) => r.lostAnyClient],
  ["proprias_perdidas_pelo_autor", (r) => r.ownLost],
  ["taxa_perda_persistida", (r) => r.lossRatePersisted],
  ["convergiu", (r) => (r.converged ? 1 : 0)],
  ["persistido_igual_oraculo", (r) => (r.persistedMatchesOracle ? 1 : 0)],
  ["duracao_real_falha_ms", (r) => r.actualOutageMs],
  ["reconexao_ms", (r) => r.reconnectMs],
  ["recuperacao_ms", (r) => r.recoveryMs],
  ["fila_na_volta", (r) => r.pendingAtRestore],
  ["boot_servidor_ms", (r) => r.serverBootMs],
];

function groupRuns(runs: RunResult[]): Group[] {
  const groups = new Map<string, Group>();
  for (const r of runs) {
    const key = [r.scenario, r.mode, r.outageMs, r.ratePerClient, r.restartExtraMs].join("|");
    const group = groups.get(key) ?? {
      scenario: r.scenario,
      mode: r.mode,
      outageMs: r.outageMs,
      ratePerClient: r.ratePerClient,
      restartExtraMs: r.restartExtraMs,
      runs: [],
    };
    group.runs.push(r);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function summarize(group: Group) {
  return Object.fromEntries(SUMMARY_METRICS.map(([key, get]) => [key, dispersion(group.runs.map(get))])) as Record<
    string,
    Dispersion
  >;
}

const MODE_LABEL: Record<Mode, string> = {
  sem_mecanismo: "Sem mecanismo",
  mecanismo_original: "Mecanismo original",
  mecanismo_corrigido: "Mecanismo corrigido",
};

const num = (v: number, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : "—");
const meanSd = (d: Dispersion, digits = 0) => (d.n ? `${num(d.mean, digits)} ± ${num(d.sd, digits)}` : "—");
const pct = (d: Dispersion) => (d.n ? `${(d.mean * 100).toFixed(1)}% ± ${(d.sd * 100).toFixed(1)}` : "—");
const share = (d: Dispersion, total: number) => `${Math.round(d.mean * d.n)}/${total}`;
const recovery = (d: Dispersion, total: number) =>
  d.n ? `${num(d.mean)} ± ${num(d.sd)} (p50 ${num(d.p50)}; ${d.n}/${total})` : `não recuperou (0/${total})`;

function scenarioLabel(g: Group) {
  if (g.scenario === "duracao") return `${g.outageMs / 1000} s`;
  if (g.scenario === "concorrencia") return `${g.ratePerClient} op/s`;
  return g.restartExtraMs ? `boot + ${g.restartExtraMs / 1000} s` : "boot";
}

function table(groups: Group[], firstColumn: string) {
  const rows = groups.map((g) => {
    const m = summarize(g);
    const n = g.runs.length;
    return (
      `| ${scenarioLabel(g)} | ${MODE_LABEL[g.mode]} | ${meanSd(m.ops_durante_falha)} | ${pct(m.taxa_perda_clientes)} | ` +
      `${meanSd(m.ops_perdidas_algum_cliente, 1)} | ${meanSd(m.proprias_perdidas_pelo_autor, 1)} | ${pct(m.taxa_perda_persistida)} | ${share(m.convergiu, n)} | ` +
      `${share(m.persistido_igual_oraculo, n)} | ${meanSd(m.reconexao_ms)} | ${recovery(m.recuperacao_ms, n)} |`
    );
  });
  return [
    `| ${firstColumn} | Versão | Ops durante a falha | Perda nos clientes | Ops ausentes em algum cliente | Próprias ops sumidas do autor | Perda no banco | Réplicas convergiram | Banco = estado esperado | Reconexão (ms) | Recuperação (ms) |`,
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function toMarkdown(env: Record<string, unknown>, groups: Group[]) {
  const by = (s: ScenarioKind) => groups.filter((g) => g.scenario === s);
  const restart = by("reinicio");
  const bootLine = restart.length
    ? `Tempo de boot do servidor reiniciado: ${meanSd(dispersion(restart.flatMap((g) => g.runs.map((r) => r.serverBootMs))))} ms.`
    : "";

  return [
    "# Experimento de desconexão e reconexão",
    "",
    `Gerado por \`npm run experiment:reconnection\` em ${env.date}.`,
    "",
    `Ambiente: ${env.cpu} (${env.cores} núcleos), ${env.memoryGb} GB de RAM, Node ${env.node}. Backend real ` +
      "(NestJS + Socket.IO) com MongoDB em memória num processo separado que sobrevive ao reinício do servidor. " +
      "Clientes: o `realtimeService` e o store CRDT reais do frontend, com a mesma lógica de autosave (2 s) e de " +
      "ressincronização do `Constructor`, rodando em Node.",
    "",
    "## Desenho",
    "",
    "- Três editores (ana, bruno, carla) no mesmo diagrama, que começa com 3 entidades compartilhadas.",
    "- Cada editor gera operações na taxa indicada: 40% criam uma entidade nova, 40% adicionam um atributo a uma " +
      "entidade compartilhada (edição concorrente no mesmo elemento) e 20% movem uma entidade compartilhada (conflito LWW).",
    `- A edição começa ${PRE_EDIT_MS / 1000} s antes da falha e para no instante em que a conexão (ou o servidor) volta.`,
    "- **Desconexão do cliente**: um proxy TCP entre a ana e o servidor derruba as conexões e recusa novas durante o " +
      "intervalo (WebSocket e HTTP, como um navegador offline). Os outros dois seguem conectados e editando.",
    "- **Reinício do servidor**: o processo do backend recebe SIGKILL e é iniciado de novo sobre o mesmo banco; todos " +
      "os clientes perdem a conexão e continuam editando até o servidor voltar. O log de operações em memória se perde.",
    "- **Sem mecanismo**: o `realtimeService` da versão anterior à reconexão sem perda (commit `8c2e547`), que " +
      "descarta operações enviadas sem conexão e reentra na sala sem pedir o que perdeu.",
    "- **Mecanismo original**: a reconexão sem perda como foi implementada (fila no cliente, `join_diagram` com " +
      "`since`, reenvio e recarga do servidor quando o log não cobre o intervalo).",
    "- **Mecanismo corrigido**: o original com as duas correções motivadas por este experimento: o autosave fica " +
      "pausado enquanto o cliente está reconectando e as operações próprias reaplicadas contam como alteração " +
      "pendente; e, quando a época do log mudou (reinício do servidor), o `sync` traz as operações da época nova, " +
      "aplicadas depois da recarga.",
    "",
    "## Métricas",
    "",
    "- **Estado esperado (oráculo)**: uma réplica do store que aplica todas as operações geradas por todos; como o " +
      "store é um CRDT, esse é o estado ao qual todos deveriam convergir.",
    "- **Perda nos clientes**: fração das operações verificáveis (criação de entidade ou de atributo) cujo efeito não " +
      "está no estado final de cada cliente, média dos 3 clientes. **Ops ausentes em algum cliente**: quantas faltam em pelo menos um. " +
      "**Próprias ops sumidas do autor**: operações que desapareceram até da tela de quem as fez.",
    "- **Perda no banco**: fração das operações verificáveis ausentes no documento salvo no MongoDB após o autosave.",
    "- **Réplicas convergiram**: execuções em que os 3 clientes terminaram idênticos ao oráculo (inclui posições).",
    "- **Reconexão**: da volta da rede/servidor até o cliente voltar a estar na sala (todos, no reinício).",
    "- **Recuperação**: da volta da rede/servidor até todos os clientes ficarem idênticos ao oráculo; entre parênteses, " +
      `a mediana e quantas execuções recuperaram dentro de ${CONVERGENCE_GRACE_MS / 1000} s após a reconexão.`,
    "",
    `Cada célula é média ± desvio padrão de ${env.repetitions} repetições.`,
    "",
    "## 1. Duração da desconexão do cliente",
    "",
    `Taxa de edição: ${BASE_RATE} op/s por editor.`,
    "",
    table(by("duracao"), "Desconexão"),
    "",
    "## 2. Intensidade das edições concorrentes durante a desconexão",
    "",
    `Desconexão de ${RATE_DURATION_MS / 1000} s.`,
    "",
    table(by("concorrencia"), "Taxa por editor"),
    "",
    "## 3. Reinício do servidor",
    "",
    `Taxa de edição: ${BASE_RATE} op/s por editor. "boot" = o servidor é reiniciado imediatamente; ` +
      `"boot + N s" = fica fora do ar N s antes de reiniciar. ${bootLine}`,
    "",
    table(restart, "Indisponibilidade"),
    "",
    "Os dados por execução estão em `reconnection-execucoes.csv`, o resumo estatístico (IC 95% pela t de Student) em " +
      "`reconnection-resumo.csv` e tudo em `reconnection.json`.",
    "",
  ].join("\n");
}

function toRunsCsv(runs: RunResult[]) {
  const header =
    "cenario,versao,desconexao_ms,taxa_por_editor,reinicio_extra_ms,repeticao,ops_total,ops_durante_falha,ops_offline_desconectado," +
    "ops_verificaveis,perdidas_ana,perdidas_bruno,perdidas_carla,perdidas_algum_cliente,proprias_perdidas_autor,taxa_perda_clientes,perdidas_banco," +
    "taxa_perda_banco,convergiu,banco_igual_oraculo,duracao_real_falha_ms,reconexao_ms,recuperacao_ms,fila_na_volta,boot_servidor_ms,ressincronizacoes,autosaves_falhos";
  const rows = runs.map((r) =>
    [
      r.scenario,
      r.mode,
      r.outageMs,
      r.ratePerClient,
      r.restartExtraMs,
      r.repetition,
      r.opsTotal,
      r.opsDuringOutage,
      r.offlineOpsDisconnected,
      r.keysTotal,
      r.lostPerClient.ana,
      r.lostPerClient.bruno,
      r.lostPerClient.carla,
      r.lostAnyClient,
      r.ownLost,
      r.lossRateClients,
      r.lostPersisted,
      r.lossRatePersisted,
      r.converged ? 1 : 0,
      r.persistedMatchesOracle ? 1 : 0,
      r.actualOutageMs,
      r.reconnectMs ?? "",
      r.recoveryMs ?? "",
      r.pendingAtRestore,
      r.serverBootMs ?? "",
      r.resyncs,
      r.savesFailed,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function toSummaryCsv(groups: Group[]) {
  const header =
    "cenario,versao,desconexao_ms,taxa_por_editor,reinicio_extra_ms,metrica,n,media,desvio_padrao,mediana,min,max,ic95_inf,ic95_sup";
  const rows = groups.flatMap((g) => {
    const m = summarize(g);
    return SUMMARY_METRICS.map(([key]) => {
      const d = m[key];
      return [g.scenario, g.mode, g.outageMs, g.ratePerClient, g.restartExtraMs, key, d.n, d.mean, d.sd, d.p50, d.min, d.max, d.ci95Low, d.ci95High]
        .map((v) => (typeof v === "number" && !Number.isFinite(v) ? "" : v))
        .join(",");
    });
  });
  return [header, ...rows].join("\n");
}

function writeReports(runs: RunResult[], finished: boolean) {
  const environment = {
    date: new Date().toISOString(),
    finished,
    node: process.version,
    cpu: cpus()[0]?.model,
    cores: cpus().length,
    memoryGb: round(totalmem() / 1024 ** 3),
    repetitions: REPEATS,
    durationsMs: DURATIONS_MS,
    baseRatePerClient: BASE_RATE,
    rates: RATES,
    rateDurationMs: RATE_DURATION_MS,
    restartExtraMs: RESTART_EXTRA_MS,
    preEditMs: PRE_EDIT_MS,
    convergenceGraceMs: CONVERGENCE_GRACE_MS,
    settleMs: SETTLE_MS,
  };
  const groups = groupRuns(runs);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, "reconnection.json"),
    JSON.stringify({ environment, summary: groups.map((g) => ({ ...g, runs: undefined, metrics: summarize(g) })), runs }, null, 2),
  );
  writeFileSync(resolve(OUT_DIR, "reconnection-execucoes.csv"), toRunsCsv(runs));
  writeFileSync(resolve(OUT_DIR, "reconnection-resumo.csv"), toSummaryCsv(groups));
  writeFileSync(resolve(OUT_DIR, "reconnection.md"), toMarkdown(environment, groups));
}

function configKey(c: RunConfig) {
  return [c.scenario, c.mode, c.outageMs, c.ratePerClient, c.restartExtraMs, c.repetition].join("|");
}

function previousRuns(): RunResult[] {
  const file = resolve(OUT_DIR, "reconnection.json");
  if (!RESUME || !existsSync(file)) return [];
  const runs = (JSON.parse(readFileSync(file, "utf8")).runs ?? []) as RunResult[];
  const planned = new Set(plan().map(configKey));
  const kept = runs.filter((r) => planned.has(configKey(r)));
  process.stdout.write(`Retomando: ${kept.length} execuções já registradas.\n`);
  return kept;
}

async function runWithRetries(config: RunConfig): Promise<RunResult> {
  for (let attempt = 1; ; attempt++) {
    const wallStart = Date.now();
    const monoStart = performance.now();
    try {
      const result = await runOnce(config);
      const drift = Date.now() - wallStart - (performance.now() - monoStart);
      if (Math.abs(drift) <= CLOCK_DRIFT_LIMIT_MS) return result;
      process.stdout.write(`Execução descartada: relógio real divergiu ${Math.round(drift)} ms (suspensão?).\n`);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      process.stdout.write(`Execução falhou (tentativa ${attempt}): ${(error as Error).message}\n`);
    }
    if (attempt >= MAX_ATTEMPTS) throw new Error(`execução ${configKey(config)} não concluiu em ${MAX_ATTEMPTS} tentativas`);
    if (config.scenario !== "reinicio") continue;
    await backend.killServer();
    await backend.startServer();
  }
}

describe("experimento de desconexão", () => {
  beforeAll(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    backend = new Backend(PORT);
    await backend.start();
    users = [
      await registerUser(backend.url, "ana"),
      await registerUser(backend.url, "bruno"),
      await registerUser(backend.url, "carla"),
    ];
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await backend?.stop();
  });

  it("compara perda de operações e tempo de recuperação com e sem o mecanismo", async () => {
    const configs = plan();
    const runs: RunResult[] = previousRuns();
    const done = new Set(runs.map(configKey));
    const started = performance.now();

    for (const [index, config] of configs.entries()) {
      if (done.has(configKey(config))) continue;
      const result = await runWithRetries(config);
      runs.push(result);
      writeReports(runs, false);

      const elapsed = (performance.now() - started) / 1000;
      process.stdout.write(
        `[${index + 1}/${configs.length} | ${elapsed.toFixed(0)} s] ${config.scenario} ${config.mode} ` +
          `falha=${config.outageMs}ms taxa=${config.ratePerClient} extra=${config.restartExtraMs}ms #${config.repetition} → ` +
          `ops=${result.opsTotal} durante=${result.opsDuringOutage} perda_clientes=${(result.lossRateClients * 100).toFixed(1)}% ` +
          `perda_banco=${(result.lossRatePersisted * 100).toFixed(1)}% convergiu=${result.converged} ` +
          `reconexao=${result.reconnectMs ?? "—"}ms recuperacao=${result.recoveryMs ?? "—"}ms fila=${result.pendingAtRestore}\n`,
      );
    }

    writeReports(runs, true);
  });
});
