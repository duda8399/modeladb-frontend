import { vi } from "vitest";
import type {
  CollabEdge,
  CollabNode,
  Operation,
  OperationDraft,
} from "../stores/diagramCollabStore";

/**
 * Uma réplica simula um navegador com sua própria instância do store.
 *
 * O store é um singleton de módulo (Zustand), então cada réplica recarrega o
 * módulo do zero com `vi.resetModules()`. Os métodos reproduzem exatamente o
 * que o Constructor faz em produção:
 *  - edição local: stampOperation + applyOperation(op) (entra no histórico)
 *  - operação remota: applyOperation(op, false) (não entra no histórico)
 */
export async function createReplica(userId: string) {
  vi.resetModules();
  const mod = await import("../stores/diagramCollabStore");
  const store = mod.useDiagramCollabStore;

  return {
    userId,
    store,
    state: () => store.getState(),

    load(nodes: CollabNode[], edges: CollabEdge[] = []) {
      store.getState().loadDocument(structuredClone(nodes), structuredClone(edges));
    },

    local(draft: OperationDraft): Operation {
      const op = store.getState().stampOperation(draft, userId);
      store.getState().applyOperation(op);
      return op;
    },

    receive(op: Operation) {
      store.getState().applyOperation(structuredClone(op), false);
    },

    undo(): Operation | null {
      return store.getState().undo(userId);
    },

    redo(): Operation | null {
      return store.getState().redo(userId);
    },

    /** Estado canônico, independente da ordem de chegada, para comparação. */
    snapshot() {
      const { nodes, edges } = store.getState();
      const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

      return {
        nodes: [...nodes].sort(byId).map((n) => ({
          ...n,
          data: {
            ...n.data,
            fields: n.data.fields ? [...n.data.fields].sort(byId) : undefined,
          },
        })),
        edges: [...edges].sort(byId),
      };
    },

    /** O que o usuário vê na tela: sem itens apagados, campos ordenados. */
    visible() {
      const { nodes, edges } = store.getState().compactDocument();
      return {
        nodes: nodes
          .map((n) => ({
            id: n.id,
            name: n.data.name,
            position: n.position,
            fields: [...n.data.fields]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
              .map((f) => ({ id: f.id, name: f.name, type: f.type, pk: f.pk })),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        edges: edges.map((e) => e.id).sort(),
      };
    },
  };
}

export type Replica = Awaited<ReturnType<typeof createReplica>>;

export function entity(id: string, name = id, x = 0, y = 0): CollabNode {
  return {
    id,
    type: "entityNode",
    position: { x, y },
    data: { name, fields: [] },
  } as CollabNode;
}

export function field(id: string, name = id, order = 0) {
  return {
    id,
    name,
    type: "INT",
    pk: false,
    fk: false,
    notNull: false,
    unique: false,
    ai: false,
    order,
  };
}

export function edge(id: string, source: string, target: string): CollabEdge {
  return {
    id,
    source,
    target,
    type: "floating",
    data: { relationType: "1:N", sourceNodeId: source, targetNodeId: target },
  } as CollabEdge;
}
