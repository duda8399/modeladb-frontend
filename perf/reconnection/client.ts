import { vi } from "vitest";
import { performance } from "node:perf_hooks";
import type { CollabEdge, CollabNode, Operation, OperationDraft } from "../../src/stores/diagramCollabStore";
import type { CustomEdge, CustomNode } from "../../src/types/diagramER";
import { buildSavePayload } from "../../src/views/Constructor/hooks/useAutosave";
import { normalizeLoadedEdges } from "../../src/utils/loadedDiagram";
import { defaultPkField } from "../../src/utils/primaryKey";
import { request, type User } from "./backend";

export type Mode = "sem_mecanismo" | "mecanismo_original" | "mecanismo_corrigido";

type StoreModule = typeof import("../../src/stores/diagramCollabStore");
type Store = StoreModule["useDiagramCollabStore"];

type ServerDiagram = { name?: string; nodes?: CustomNode[]; edges?: CustomEdge[] };

type LooseService = {
  connect: (params: Record<string, unknown>) => void;
  disconnect: () => void;
  sendOperation: (op: Operation) => void;
  getPendingOperations?: () => Operation[];
};

const AUTOSAVE_DELAY_MS = 2000;
const MAX_TRACKED_OWN_OPS = 5000;

export type VisibleState = {
  nodes: { id: string; name: string; x: number; y: number; fields: { id: string; name: string }[] }[];
};

export function visibleState(nodes: { id: string; data: Record<string, unknown>; position?: { x: number; y: number } }[]): VisibleState {
  return {
    nodes: nodes
      .filter((n) => !n.data?.deleted)
      .map((n) => ({
        id: n.id,
        name: String(n.data?.name ?? ""),
        x: Math.round(Number(n.position?.x ?? 0) * 1000) / 1000,
        y: Math.round(Number(n.position?.y ?? 0) * 1000) / 1000,
        fields: ((n.data?.fields as { id: string; name: string; deleted?: boolean }[]) ?? [])
          .filter((f) => !f.deleted)
          .map((f) => ({ id: f.id, name: f.name }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function hasKey(state: VisibleState, key: string) {
  const [kind, nodeId, fieldId] = key.split(":");
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  return kind === "node" || node.fields.some((f) => f.id === fieldId);
}

export async function createStore(): Promise<Store> {
  vi.resetModules();
  const mod: StoreModule = await import("../../src/stores/diagramCollabStore");
  return mod.useDiagramCollabStore;
}

export class SimClient {
  store!: Store;
  private service!: LooseService;
  private unsavedOwnOps: Operation[] = [];
  private savedSignature: string | null = null;
  private lastDeps: { dirty: boolean; paused: boolean; signature: string } | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private suppressRender = false;
  private stopped = false;
  joinedAt = -1;
  status = "offline";
  savesOk = 0;
  savesFailed = 0;
  resyncs = 0;
  remoteApplied = 0;

  readonly label: string;
  user: User;
  readonly mode: Mode;
  readonly baseUrl: string;
  readonly diagramId: string;

  constructor(label: string, user: User, mode: Mode, baseUrl: string, diagramId: string) {
    this.label = label;
    this.user = user;
    this.mode = mode;
    this.baseUrl = baseUrl;
    this.diagramId = diagramId;
  }

  async start() {
    vi.resetModules();
    const storeModule: StoreModule = await import("../../src/stores/diagramCollabStore");
    this.store = storeModule.useDiagramCollabStore;
    const serviceModule =
      this.mode === "mecanismo_corrigido"
        ? await import("../../src/services/realtimeService")
        : this.mode === "mecanismo_original"
          ? await import("./originalMechanismRealtimeService")
          : await import("./baselineRealtimeService");
    this.service = serviceModule.default as unknown as LooseService;

    const data = await this.get();
    this.applyServerDiagram(data);
    this.setBaseline();

    this.store.subscribe(() => this.render());

    const joined = new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.label}: entrada na sala excedeu 15 s`)), 15_000);
      this.onJoined = () => {
        clearTimeout(timer);
        resolvePromise();
      };
    });

    vi.stubEnv("VITE_BACKEND_URL", this.baseUrl);
    this.service.connect({
      diagramId: this.diagramId,
      getToken: () => this.user.token,
      onOperation: (op: Operation) => {
        this.remoteApplied++;
        this.store.getState().applyOperation(op, false);
      },
      onPresence: (event: { type: string }) => {
        if (event.type === "ONLINE_USERS" && this.mode === "sem_mecanismo") this.markJoined();
      },
      onCursor: () => {},
      onError: () => {},
      onStatusChange: (status: string) => {
        this.status = status;
        if (status === "connected") this.markJoined();
        this.render();
      },
      onResyncNeeded: () => this.resyncFromServer(),
    });

    await joined;
  }

  private onJoined: () => void = () => {};

  private markJoined() {
    this.joinedAt = performance.now();
    this.onJoined();
  }

  edit(draft: OperationDraft): Operation | null {
    if (this.stopped) return null;
    const store = this.store.getState();
    const op = store.stampOperation(draft, this.user.id);
    store.applyOperation(op);

    if (this.mode !== "sem_mecanismo") {
      this.unsavedOwnOps.push(op);
      if (this.unsavedOwnOps.length > MAX_TRACKED_OWN_OPS) {
        this.unsavedOwnOps.splice(0, this.unsavedOwnOps.length - MAX_TRACKED_OWN_OPS);
      }
    }

    this.service.sendOperation(op);
    return op;
  }

  pendingCount() {
    return this.service.getPendingOperations?.().length ?? 0;
  }

  visible(): VisibleState {
    return visibleState(this.store.getState().nodes as never);
  }

  getNode(id: string) {
    return this.store.getState().getNode(id);
  }

  async idle() {
    while (this.saveInFlight) await this.saveInFlight;
  }

  stop() {
    this.stopped = true;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.service.disconnect();
  }

  private async get(): Promise<ServerDiagram> {
    return request<ServerDiagram>(this.baseUrl, "GET", `/diagram/${this.diagramId}`, undefined, this.user.token);
  }

  private applyServerDiagram(data: ServerDiagram) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = normalizeLoadedEdges(nodes, Array.isArray(data?.edges) ? data.edges : []);
    this.suppressRender = true;
    this.store.getState().loadDocument(nodes as unknown as CollabNode[], edges as unknown as CollabEdge[]);
    this.suppressRender = false;
    this.savedSignature = null;
  }

  private setBaseline() {
    this.savedSignature = this.signature();
    this.render();
  }

  private async resyncFromServer() {
    this.resyncs++;
    try {
      const data = await this.get();
      const replay = [...this.unsavedOwnOps];
      const queued = new Set((this.service.getPendingOperations?.() ?? []).map((op) => op.opId));

      this.applyServerDiagram(data);

      const store = this.store.getState();
      this.suppressRender = true;
      replay.forEach((op) => store.applyOperation(op, false));
      this.suppressRender = false;
      replay.filter((op) => !queued.has(op.opId)).forEach((op) => this.service.sendOperation(op));
      if (this.mode === "mecanismo_corrigido" && replay.length) {
        this.savedSignature = "";
        this.render();
      } else {
        this.setBaseline();
      }
    } catch {
      this.setBaseline();
    }
  }

  private payload() {
    const { nodes, edges } = this.store.getState();
    return buildSavePayload(
      "Reconexão",
      nodes.filter((n) => !n.data?.deleted) as unknown as CustomNode[],
      edges.filter((e) => !e.data?.deleted) as unknown as CustomEdge[],
    );
  }

  private signature() {
    return JSON.stringify(this.payload());
  }

  private render() {
    if (this.suppressRender || this.stopped) return;
    const signature = this.signature();
    if (this.savedSignature === null) this.savedSignature = signature;
    const dirty = signature !== this.savedSignature;
    const paused = this.paused();
    const last = this.lastDeps;

    if (last && last.dirty === dirty && last.paused === paused && last.signature === signature) return;
    this.lastDeps = { dirty, paused, signature };

    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (!dirty || paused) return;

    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.persist();
    }, AUTOSAVE_DELAY_MS);
  }

  private paused() {
    return this.mode === "mecanismo_corrigido" && this.status === "reconnecting";
  }

  private async persist() {
    if (this.paused()) return;
    if (this.saveInFlight || this.stopped) return;

    const payload = this.payload();
    const signature = JSON.stringify(payload);
    const count = this.unsavedOwnOps.length;

    const run = async () => {
      try {
        await request(this.baseUrl, "PUT", `/diagram/${this.diagramId}`, payload, this.user.token);
        this.savesOk++;
        this.unsavedOwnOps.splice(0, count);
        this.savedSignature = signature;
        this.render();
      } catch {
        this.savesFailed++;
      }
    };

    const promise = run();
    this.saveInFlight = promise;
    await promise;
    this.saveInFlight = null;
  }
}

export function sharedEntity(id: string, name: string, x: number): CollabNode {
  return {
    id,
    type: "entityNode",
    position: { x, y: 0 },
    data: { name, fields: [{ ...defaultPkField(`${id}-pk`), order: 0 }] },
  } as unknown as CollabNode;
}
