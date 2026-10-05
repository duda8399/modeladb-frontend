import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createReplica, edge, entity, field, type Replica } from "../test/replica";
import type { Operation, OperationDraft } from "./diagramCollabStore";

/**
 * Item 1 — Testes baseados em propriedades (property-based testing).
 *
 * Em vez de cenários escritos à mão, o fast-check gera centenas de sessões
 * aleatórias de edição concorrente entre 3 usuários e verifica as
 * propriedades que um CRDT precisa garantir:
 *
 *  1. Convergência: depois que todas as mensagens são entregues, todas as
 *     réplicas têm exatamente o mesmo estado.
 *  2. Independência da ordem: o estado final não depende da ordem em que as
 *     operações chegam a cada réplica.
 *  3. Causalidade: uma edição feita depois de ver outra edição do mesmo
 *     registro sempre vence.
 *
 * Quando uma propriedade falha, o fast-check "encolhe" o caso até o menor
 * exemplo que ainda reproduz o problema e imprime a semente para repeti-lo.
 */

const USERS = ["ana", "bruno", "carla"] as const;
const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 300);
const TIMEOUT = Math.max(30_000, NUM_RUNS * 5);

const initialNodes = () => [entity("n1", "Cliente", 0, 0), entity("n2", "Pedido", 300, 0)];

// ---------------------------------------------------------------------------
// Geração de ações
// ---------------------------------------------------------------------------

type Action =
  | { kind: "edit"; user: number; edit: EditKind; pick: number; value: number }
  | { kind: "undo"; user: number }
  | { kind: "redo"; user: number }
  | { kind: "deliver"; to: number; from: number; count: number };

type EditKind =
  | "move"
  | "rename"
  | "deleteNode"
  | "restoreNode"
  | "addNode"
  | "addField"
  | "renameField"
  | "toggleFieldPk"
  | "removeField"
  | "reorderField"
  | "addEdge"
  | "deleteEdge";

const editKind = fc.constantFrom<EditKind>(
  "move",
  "rename",
  "deleteNode",
  "restoreNode",
  "addNode",
  "addField",
  "renameField",
  "toggleFieldPk",
  "removeField",
  "reorderField",
  "addEdge",
  "deleteEdge",
);

const user = fc.integer({ min: 0, max: USERS.length - 1 });

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant("edit" as const), user, edit: editKind, pick: fc.nat(), value: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("undo" as const), user }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("redo" as const), user }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("deliver" as const), to: user, from: user, count: fc.integer({ min: 1, max: 4 }) }) },
);

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

/**
 * Traduz uma ação abstrata numa operação concreta, olhando apenas para o que
 * a réplica daquele usuário conhece naquele momento (como na interface real:
 * só dá para editar o que está na tela).
 */
function draftFor(replica: Replica, a: Extract<Action, { kind: "edit" }>, seq: number): OperationDraft | null {
  const state = replica.state();
  const nodes = state.nodes.filter((n) => !n.data.deleted);
  const deletedNodes = state.nodes.filter((n) => n.data.deleted);
  const pickFrom = <T,>(list: T[]) => (list.length ? list[a.pick % list.length] : undefined);
  const uid = `${replica.userId}-${seq}`;

  const node = pickFrom(nodes);
  const fields = (node?.data.fields ?? []).filter((f) => !f.deleted);
  const fieldPicked = pickFrom(fields);

  switch (a.edit) {
    case "move":
      return node
        ? { type: "MOVE_NODE", targetId: node.id, payload: { x: a.value * 10, y: a.value * 5 }, previousPosition: { ...node.position } }
        : null;
    case "rename":
      return node
        ? { type: "SET_NODE_PROP", targetId: node.id, payload: { key: "name", value: `nome-${a.value}` }, previousValue: node.data.name }
        : null;
    case "deleteNode":
      return node ? { type: "DELETE_NODE", targetId: node.id } : null;
    case "restoreNode": {
      const target = pickFrom(deletedNodes);
      return target ? { type: "RESTORE_NODE", targetId: target.id } : null;
    }
    case "addNode":
      return { type: "ADD_NODE", targetId: `node-${uid}`, payload: entity(`node-${uid}`, `Nova ${uid}`, a.value, a.value) };
    case "addField":
      return node
        ? { type: "ADD_FIELD", targetId: node.id, payload: field(`field-${uid}`, `campo_${a.value}`, fields.length) }
        : null;
    case "renameField":
      return node && fieldPicked
        ? { type: "SET_FIELD_PROP", targetId: node.id, payload: { fieldId: fieldPicked.id, key: "name", value: `c${a.value}` }, previousValue: fieldPicked.name }
        : null;
    case "toggleFieldPk":
      return node && fieldPicked
        ? { type: "SET_FIELD_PROP", targetId: node.id, payload: { fieldId: fieldPicked.id, key: "pk", value: !fieldPicked.pk }, previousValue: fieldPicked.pk }
        : null;
    case "removeField":
      return node && fieldPicked ? { type: "REMOVE_FIELD", targetId: node.id, payload: { fieldId: fieldPicked.id } } : null;
    case "reorderField":
      return node && fieldPicked
        ? { type: "SET_FIELD_ORDER", targetId: node.id, payload: { fieldId: fieldPicked.id, order: a.value }, previousValue: fieldPicked.order }
        : null;
    case "addEdge": {
      if (nodes.length < 2) return null;
      const source = nodes[a.pick % nodes.length];
      const target = nodes[(a.pick + 1) % nodes.length];
      return { type: "ADD_EDGE", targetId: `edge-${uid}`, payload: edge(`edge-${uid}`, source.id, target.id) };
    }
    case "deleteEdge": {
      const target = pickFrom(state.edges.filter((e) => !e.data?.deleted));
      return target ? { type: "DELETE_EDGE", targetId: target.id } : null;
    }
  }
}

type Network = {
  replicas: Replica[];
  /** inbox[to][from] = fila FIFO de operações ainda não entregues. */
  inbox: Operation[][][];
  /** Todas as operações emitidas, na ordem em que foram geradas. */
  log: Operation[];
};

async function createNetwork(): Promise<Network> {
  const replicas: Replica[] = [];
  for (const name of USERS) {
    const replica = await createReplica(name);
    replica.load(initialNodes());
    replicas.push(replica);
  }

  return {
    replicas,
    inbox: USERS.map(() => USERS.map(() => [])),
    log: [],
  };
}

function broadcast(net: Network, from: number, op: Operation | null) {
  if (!op) return;
  net.log.push(op);
  net.inbox.forEach((queues, to) => {
    if (to !== from) queues[from].push(op);
  });
}

/** Executa a sessão com entrega causal (FIFO por remetente), como o gateway. */
function runSession(net: Network, actions: Action[]) {
  actions.forEach((a, seq) => {
    if (a.kind === "edit") {
      const draft = draftFor(net.replicas[a.user], a, seq);
      if (draft) broadcast(net, a.user, net.replicas[a.user].local(draft));
    } else if (a.kind === "undo") {
      broadcast(net, a.user, net.replicas[a.user].undo());
    } else if (a.kind === "redo") {
      broadcast(net, a.user, net.replicas[a.user].redo());
    } else if (a.to !== a.from) {
      const queue = net.inbox[a.to][a.from];
      queue.splice(0, a.count).forEach((op) => net.replicas[a.to].receive(op));
    }
  });
}

function deliverEverything(net: Network) {
  net.inbox.forEach((queues, to) =>
    queues.forEach((queue) => queue.splice(0).forEach((op) => net.replicas[to].receive(op))),
  );
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe("Convergência do CRDT (property-based)", () => {
  it("todas as réplicas convergem para o mesmo estado após entregar todas as mensagens", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 60 }), async (actions) => {
        const net = await createNetwork();

        runSession(net, actions);
        deliverEverything(net);

        const [first, ...rest] = net.replicas.map((r) => r.snapshot());
        rest.forEach((other) => expect(other).toEqual(first));
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT);

  it("o estado final não depende da ordem de chegada das operações", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 1, maxLength: 40 }),
        fc.array(fc.nat(), { minLength: 1, maxLength: 200 }),
        async (actions, shuffleSeed) => {
          // Gera o log de operações de uma sessão normal...
          const net = await createNetwork();
          runSession(net, actions);

          // ...e entrega o log inteiro a duas réplicas novas: uma na ordem
          // original e outra embaralhada (simula atrasos/reconexões).
          const ordered = await createReplica("observador-1");
          const shuffled = await createReplica("observador-2");
          ordered.load(initialNodes());
          shuffled.load(initialNodes());

          const permuted = [...net.log];
          for (let i = permuted.length - 1; i > 0; i--) {
            const j = shuffleSeed[i % shuffleSeed.length] % (i + 1);
            [permuted[i], permuted[j]] = [permuted[j], permuted[i]];
          }

          net.log.forEach((op) => ordered.receive(op));
          permuted.forEach((op) => shuffled.receive(op));

          expect(shuffled.snapshot()).toEqual(ordered.snapshot());
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT);

  it("entregar operações repetidas (reenvio) não altera o estado final", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 40 }), async (actions) => {
        const net = await createNetwork();
        runSession(net, actions);

        const once = await createReplica("observador-1");
        const twice = await createReplica("observador-2");
        once.load(initialNodes());
        twice.load(initialNodes());

        net.log.forEach((op) => once.receive(op));
        net.log.forEach((op) => twice.receive(op));
        net.log.forEach((op) => twice.receive(op));

        expect(twice.snapshot()).toEqual(once.snapshot());
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT);

  it("uma edição feita depois de ver a edição de outro usuário sempre vence (causalidade)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 0, maxLength: 40 }),
        fc.integer({ min: 0, max: USERS.length - 1 }),
        fc.integer({ min: 0, max: USERS.length - 1 }),
        async (warmup, writerA, writerB) => {
          fc.pre(writerA !== writerB);
          const net = await createNetwork();
          runSession(net, warmup);
          deliverEverything(net);

          const a = net.replicas[writerA];
          const b = net.replicas[writerB];
          const target = a.state().nodes[0].id;

          // A renomeia; B recebe a edição de A e só então renomeia também.
          broadcast(net, writerA, a.local({ type: "SET_NODE_PROP", targetId: target, payload: { key: "name", value: "de A" } }));
          net.inbox[writerB][writerA].splice(0).forEach((op) => b.receive(op));
          broadcast(net, writerB, b.local({ type: "SET_NODE_PROP", targetId: target, payload: { key: "name", value: "de B" } }));
          deliverEverything(net);

          net.replicas.forEach((r) => expect(r.state().getNode(target)?.data.name).toBe("de B"));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT);
});
