import { create } from "zustand";
import type { XYPosition } from "reactflow";
import type { CustomNode, CustomEdge, Field } from "../types/diagramER";

export type CrdtMeta = { lamport: number; userId: string };

export interface CollabField extends Field {
  order?: number;
  deleted?: boolean;
  _crdt?: Record<string, CrdtMeta>;
}

export interface CollabNodeData {
  name?: string;
  fields?: CollabField[];
  deleted?: boolean;
  _crdt?: Record<string, CrdtMeta>;
  [key: string]: unknown;
}

export type CollabNode = Omit<CustomNode, "data"> & { data: CollabNodeData };

export interface CollabEdgeData {
  relationType?: "1:1" | "1:N" | "N:N";
  sourceNodeId?: string;
  targetNodeId?: string;
  junctionId?: string;
  fkFieldName?: string;
  deleted?: boolean;
  _crdt?: Record<string, CrdtMeta>;
}

export type CollabEdge = Omit<CustomEdge, "data"> & { data?: CollabEdgeData };

export type OperationType =
  | "ADD_NODE"
  | "MOVE_NODE"
  | "SET_NODE_NAME"
  | "DELETE_NODE"
  | "RESTORE_NODE"
  | "ADD_FIELD"
  | "REMOVE_FIELD"
  | "RESTORE_FIELD"
  | "SET_FIELD_PROP"
  | "SET_FIELD_ORDER"
  | "ADD_EDGE"
  | "DELETE_EDGE"
  | "RESTORE_EDGE";

export interface Operation {
  opId: string;
  type: OperationType;
  targetId: string;
  userId: string;
  lamport: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previousValue?: any;
  previousPosition?: XYPosition;
}

export type OperationDraft = Omit<Operation, "opId" | "userId" | "lamport">;

const MAX_HISTORY = 100;
const APPLIED_OPS_TTL = 10 * 60 * 1000;

function applyLWWRegister(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object: Record<string, any>,
  field: string,
  unknownValue: unknown,
  lamport: number,
  userId: string,
): boolean {
  const current = object._crdt?.[field] || { lamport: 0, userId: "" };
  const incoming = { lamport, userId };

  const shouldApply =
    incoming.lamport > current.lamport ||
    (incoming.lamport === current.lamport && incoming.userId > current.userId);

  if (!shouldApply) return false;

  object[field] = unknownValue;
  object._crdt = { ...(object._crdt || {}), [field]: incoming };

  return true;
}

function applyPositionAxis(
  data: CollabNodeData,
  position: XYPosition,
  axis: "x" | "y",
  value: number,
  lamport: number,
  userId: string,
): boolean {
  const key = axis === "x" ? "positionX" : "positionY";
  const current = data._crdt?.[key] || { lamport: 0, userId: "" };
  const incoming = { lamport, userId };

  const shouldApply =
    incoming.lamport > current.lamport ||
    (incoming.lamport === current.lamport && incoming.userId > current.userId);

  if (!shouldApply) return false;

  position[axis] = value;
  data._crdt = { ...(data._crdt || {}), [key]: incoming };

  return true;
}

function cloneField(field: CollabField): CollabField {
  return { ...field, _crdt: field._crdt ? { ...field._crdt } : undefined };
}

interface DiagramCollabState {
  nodes: CollabNode[];
  edges: CollabEdge[];
  undoStack: Operation[];
  redoStack: Operation[];
  appliedOps: Map<string, number>;
  nodeIndex: Map<string, CollabNode>;
  edgeIndex: Map<string, CollabEdge>;
  pendingOperations: Map<string, Operation[]>;
  lastAppliedOpsCleanup: number;
  lamport: number;

  loadDocument: (nodes: CollabNode[], edges: CollabEdge[]) => void;
  resetDocument: () => void;
  nextLamport: () => number;
  syncLamportFromDocument: () => void;
  stampOperation: (draft: OperationDraft, userId: string) => Operation;
  applyOperation: (op: Operation, saveHistory?: boolean) => void;
  undo: (userId: string) => Operation | null;
  redo: (userId: string) => Operation | null;
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compactDocument: () => { nodes: any[]; edges: any[] };
  getNode: (nodeId: string) => CollabNode | undefined;
  getEdge: (edgeId: string) => CollabEdge | undefined;
  getField: (nodeId: string, fieldId: string) => CollabField | undefined;
}

type Get = () => DiagramCollabState;
type Set = (
  partial:
    | Partial<DiagramCollabState>
    | ((state: DiagramCollabState) => Partial<DiagramCollabState>),
) => void;

function updateNodeById(
  get: Get,
  set: Set,
  nodeId: string,
  updater: (node: CollabNode) => CollabNode,
): CollabNode | null {
  const nodes = get().nodes;
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) return null;

  const updated = updater(nodes[index]);
  if (updated === nodes[index]) return null;

  const nextNodes = [...nodes];
  nextNodes[index] = updated;
  get().nodeIndex.set(nodeId, updated);
  set({ nodes: nextNodes });

  return updated;
}

function addPendingOperation(get: Get, targetId: string, op: Operation) {
  const pending = get().pendingOperations;
  pending.set(targetId, [...(pending.get(targetId) || []), op]);
}

function processPendingOperations(get: Get, set: Set, targetId: string) {
  const pending = get().pendingOperations;
  const ops = pending.get(targetId);
  if (!ops?.length) return;

  pending.delete(targetId);
  ops.forEach((pendingOp) => execute(get, set, pendingOp));
}

function executeAddNode(get: Get, set: Set, op: Operation) {
  if (!op.payload) return;

  if (get().nodeIndex.has(op.targetId)) {
    updateNodeById(get, set, op.targetId, (node) => {
      const data = { ...node.data };
      if (!applyLWWRegister(data, "deleted", false, op.lamport, op.userId)) {
        return node;
      }
      return { ...node, data };
    });
    return;
  }

  const node: CollabNode = structuredClone(op.payload);
  const nextNodes = [...get().nodes, node];
  get().nodeIndex.set(node.id, node);
  set({ nodes: nextNodes });

  processPendingOperations(get, set, node.id);
}

function executeMoveNode(get: Get, set: Set, op: Operation) {
  if (!get().nodeIndex.has(op.targetId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }
  if (!op.payload) return;

  updateNodeById(get, set, op.targetId, (node) => {
    const position = { ...node.position };
    const data = { ...node.data };

    const appliedX = applyPositionAxis(data, position, "x", op.payload.x, op.lamport, op.userId);
    const appliedY = applyPositionAxis(data, position, "y", op.payload.y, op.lamport, op.userId);

    if (!appliedX && !appliedY) return node;

    return { ...node, position, data };
  });
}

function executeSetNodeName(get: Get, set: Set, op: Operation) {
  if (!get().nodeIndex.has(op.targetId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }
  if (!op.payload) return;

  updateNodeById(get, set, op.targetId, (node) => {
    const data = { ...node.data };
    if (!applyLWWRegister(data, "name", op.payload.value, op.lamport, op.userId)) {
      return node;
    }
    return { ...node, data };
  });
}

function executeDeleteNode(get: Get, set: Set, op: Operation) {
  if (!get().nodeIndex.has(op.targetId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }

  updateNodeById(get, set, op.targetId, (node) => {
    const data = { ...node.data };
    if (!applyLWWRegister(data, "deleted", true, op.lamport, op.userId)) {
      return node;
    }
    return { ...node, data };
  });
}

function executeRestoreNode(get: Get, set: Set, op: Operation) {
  if (!get().nodeIndex.has(op.targetId)) return;

  updateNodeById(get, set, op.targetId, (node) => {
    const data = { ...node.data };
    if (!applyLWWRegister(data, "deleted", false, op.lamport, op.userId)) {
      return node;
    }
    return { ...node, data };
  });
}

function executeAddField(get: Get, set: Set, op: Operation) {
  if (!get().nodeIndex.has(op.targetId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }
  if (!op.payload) return;

  updateNodeById(get, set, op.targetId, (node) => {
    const fields = node.data.fields || [];
    const existingIndex = fields.findIndex((f) => f.id === op.payload.id);

    if (existingIndex !== -1) {
      const field = cloneField(fields[existingIndex]);
      if (!applyLWWRegister(field, "deleted", false, op.lamport, op.userId)) {
        return node;
      }
      const nextFields = [...fields];
      nextFields[existingIndex] = field;
      return { ...node, data: { ...node.data, fields: nextFields } };
    }

    const field: CollabField = structuredClone(op.payload);
    return { ...node, data: { ...node.data, fields: [...fields, field] } };
  });

  processPendingOperations(get, set, op.targetId);
}

function applyFieldMutation(
  get: Get,
  set: Set,
  op: Operation,
  key: string,
  value: unknown,
) {
  const fieldId = op.payload?.fieldId;
  if (!fieldId) return;

  if (!get().nodeIndex.has(op.targetId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }

  const node = get().nodeIndex.get(op.targetId)!;
  if (!(node.data.fields || []).some((f) => f.id === fieldId)) {
    addPendingOperation(get, op.targetId, op);
    return;
  }

  updateNodeById(get, set, op.targetId, (current) => {
    const fields = current.data.fields || [];
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return current;

    const field = cloneField(fields[index]);
    if (!applyLWWRegister(field, key, value, op.lamport, op.userId)) {
      return current;
    }

    const nextFields = [...fields];
    nextFields[index] = field;

    return { ...current, data: { ...current.data, fields: nextFields } };
  });
}

function executeRemoveField(get: Get, set: Set, op: Operation) {
  applyFieldMutation(get, set, op, "deleted", true);
}

function executeRestoreField(get: Get, set: Set, op: Operation) {
  applyFieldMutation(get, set, op, "deleted", false);
}

function executeSetFieldProp(get: Get, set: Set, op: Operation) {
  if (!op.payload?.key) return;
  applyFieldMutation(get, set, op, op.payload.key, op.payload.value);
}

function executeSetFieldOrder(get: Get, set: Set, op: Operation) {
  applyFieldMutation(get, set, op, "order", op.payload?.order);
}

function applyEdgeMutation(
  get: Get,
  set: Set,
  op: Operation,
  key: string,
  value: unknown,
) {
  const edges = get().edges;
  const index = edges.findIndex((e) => e.id === op.targetId);
  if (index === -1) return;

  const data = { ...(edges[index].data || {}) };
  if (!applyLWWRegister(data, key, value, op.lamport, op.userId)) return;

  const updated = { ...edges[index], data };
  const nextEdges = [...edges];
  nextEdges[index] = updated;
  get().edgeIndex.set(updated.id, updated);
  set({ edges: nextEdges });
}

function executeAddEdge(get: Get, set: Set, op: Operation) {
  if (!op.payload) return;

  if (get().edgeIndex.has(op.targetId)) {
    applyEdgeMutation(get, set, op, "deleted", false);
    return;
  }

  const edge: CollabEdge = structuredClone(op.payload);
  const nextEdges = [...get().edges, edge];
  get().edgeIndex.set(edge.id, edge);
  set({ edges: nextEdges });
}

function executeDeleteEdge(get: Get, set: Set, op: Operation) {
  applyEdgeMutation(get, set, op, "deleted", true);
}

function executeRestoreEdge(get: Get, set: Set, op: Operation) {
  applyEdgeMutation(get, set, op, "deleted", false);
}

function execute(get: Get, set: Set, op: Operation) {
  switch (op.type) {
    case "ADD_NODE": return executeAddNode(get, set, op);
    case "MOVE_NODE": return executeMoveNode(get, set, op);
    case "SET_NODE_NAME": return executeSetNodeName(get, set, op);
    case "DELETE_NODE": return executeDeleteNode(get, set, op);
    case "RESTORE_NODE": return executeRestoreNode(get, set, op);
    case "ADD_FIELD": return executeAddField(get, set, op);
    case "REMOVE_FIELD": return executeRemoveField(get, set, op);
    case "RESTORE_FIELD": return executeRestoreField(get, set, op);
    case "SET_FIELD_PROP": return executeSetFieldProp(get, set, op);
    case "SET_FIELD_ORDER": return executeSetFieldOrder(get, set, op);
    case "ADD_EDGE": return executeAddEdge(get, set, op);
    case "DELETE_EDGE": return executeDeleteEdge(get, set, op);
    case "RESTORE_EDGE": return executeRestoreEdge(get, set, op);
  }
}

function cleanupAppliedOpsIfNeeded(get: Get, set: Set) {
  const { appliedOps, lastAppliedOpsCleanup } = get();
  const now = Date.now();
  if (now - lastAppliedOpsCleanup < 60000) return;

  for (const [opId, timestamp] of appliedOps.entries()) {
    if (now - timestamp > APPLIED_OPS_TTL) appliedOps.delete(opId);
  }

  set({ lastAppliedOpsCleanup: now });
}

function getInverseOperation(op: Operation): OperationDraft | null {
  switch (op.type) {
    case "ADD_NODE":
      return { type: "DELETE_NODE", targetId: op.targetId };

    case "DELETE_NODE":
      return { type: "RESTORE_NODE", targetId: op.targetId };

    case "MOVE_NODE":
      return {
        type: "MOVE_NODE",
        targetId: op.targetId,
        payload: op.previousPosition,
        previousPosition: op.payload,
      };

    case "SET_NODE_NAME":
      return {
        type: "SET_NODE_NAME",
        targetId: op.targetId,
        payload: { value: op.previousValue },
        previousValue: op.payload?.value,
      };

    case "ADD_FIELD":
      return {
        type: "REMOVE_FIELD",
        targetId: op.targetId,
        payload: { fieldId: op.payload?.id },
      };

    case "REMOVE_FIELD":
      return {
        type: "RESTORE_FIELD",
        targetId: op.targetId,
        payload: { fieldId: op.payload?.fieldId },
      };

    case "SET_FIELD_PROP":
      return {
        type: "SET_FIELD_PROP",
        targetId: op.targetId,
        payload: {
          fieldId: op.payload?.fieldId,
          key: op.payload?.key,
          value: op.previousValue,
        },
        previousValue: op.payload?.value,
      };

    case "SET_FIELD_ORDER":
      return {
        type: "SET_FIELD_ORDER",
        targetId: op.targetId,
        payload: { fieldId: op.payload?.fieldId, order: op.previousValue },
        previousValue: op.payload?.order,
      };

    case "ADD_EDGE":
      return { type: "DELETE_EDGE", targetId: op.targetId };

    case "DELETE_EDGE":
      return { type: "RESTORE_EDGE", targetId: op.targetId };

    default:
      return null;
  }
}

export const useDiagramCollabStore = create<DiagramCollabState>()((set, get) => ({
  nodes: [],
  edges: [],
  undoStack: [],
  redoStack: [],
  appliedOps: new Map(),
  nodeIndex: new Map(),
  edgeIndex: new Map(),
  pendingOperations: new Map(),
  lastAppliedOpsCleanup: 0,
  lamport: 0,

  loadDocument: (nodes, edges) => {
    set({
      nodes,
      edges,
      nodeIndex: new Map(nodes.map((n) => [n.id, n])),
      edgeIndex: new Map(edges.map((e) => [e.id, e])),
      undoStack: [],
      redoStack: [],
      appliedOps: new Map(),
      pendingOperations: new Map(),
      lastAppliedOpsCleanup: 0,
    });
    get().syncLamportFromDocument();
  },

  resetDocument: () => {
    set({
      nodes: [],
      edges: [],
      undoStack: [],
      redoStack: [],
      appliedOps: new Map(),
      nodeIndex: new Map(),
      edgeIndex: new Map(),
      pendingOperations: new Map(),
      lastAppliedOpsCleanup: 0,
      lamport: 0,
    });
  },

  nextLamport: () => {
    const next = get().lamport + 1;
    set({ lamport: next });
    return next;
  },

  syncLamportFromDocument: () => {
    let max = 0;

    const scan = (crdt?: Record<string, CrdtMeta>) => {
      if (!crdt) return;
      Object.values(crdt).forEach((meta) => {
        if (meta?.lamport > max) max = meta.lamport;
      });
    };

    get().nodes.forEach((node) => {
      scan(node.data?._crdt);
      (node.data.fields || []).forEach((field) => scan(field._crdt));
    });
    get().edges.forEach((edge) => scan(edge.data?._crdt));

    set({ lamport: max });
  },

  stampOperation: (draft, userId) => ({
    ...draft,
    opId: crypto.randomUUID(),
    userId,
    lamport: get().nextLamport(),
  }),

  applyOperation: (op, saveHistory = true) => {
    if (!op?.type || !op.opId) return;

    const appliedOps = get().appliedOps;
    if (appliedOps.has(op.opId)) return;

    appliedOps.set(op.opId, Date.now());
    cleanupAppliedOpsIfNeeded(get, set);

    execute(get, set, op);

    if (saveHistory) {
      set((state) => {
        const undoStack = [...state.undoStack, op];
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        return { undoStack, redoStack: [] };
      });
    }
  },

  undo: (userId) => {
    const op = get().undoStack[get().undoStack.length - 1];
    if (!op) return null;

    const inverse = getInverseOperation(op);
    if (!inverse) return null;

    set((state) => ({ undoStack: state.undoStack.slice(0, -1) }));

    const stampedInverse: Operation = {
      ...inverse,
      opId: crypto.randomUUID(),
      userId,
      lamport: get().nextLamport(),
    };

    set((state) => {
      const redoStack = [...state.redoStack, op];
      if (redoStack.length > MAX_HISTORY) redoStack.shift();
      return { redoStack };
    });

    get().applyOperation(stampedInverse, false);

    return stampedInverse;
  },

  redo: (userId) => {
    const op = get().redoStack[get().redoStack.length - 1];
    if (!op) return null;

    set((state) => ({ redoStack: state.redoStack.slice(0, -1) }));

    const redoOp: Operation = {
      ...op,
      opId: crypto.randomUUID(),
      userId,
      lamport: get().nextLamport(),
    };

    get().applyOperation(redoOp, true);

    return redoOp;
  },

  patchNodeData: (nodeId, patch) => {
    updateNodeById(get, set, nodeId, (node) => ({
      ...node,
      data: { ...node.data, ...patch },
    }));
  },

  compactDocument: () => {
    const { nodes, edges } = get();

    const cleanNodes = nodes
      .filter((n) => !n.data?.deleted)
      .map((n) => ({
        id: n.id,
        type: n.type,
        data: {
          ...n.data,
          fields: (n.data.fields || []).filter((f) => !f.deleted),
        },
        position: { x: n.position.x, y: n.position.y },
        style: n.style ?? null,
      }));

    const validIds = new Set(cleanNodes.map((n) => n.id));

    const cleanEdges = edges
      .filter(
        (e) => !e.data?.deleted && validIds.has(e.source) && validIds.has(e.target),
      )
      .map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        label: e.label ?? null,
        type: e.type ?? "floating",
        data: e.data ?? {},
      }));

    return { nodes: cleanNodes, edges: cleanEdges };
  },

  getNode: (nodeId) => get().nodeIndex.get(nodeId),
  getEdge: (edgeId) => get().edgeIndex.get(edgeId),
  getField: (nodeId, fieldId) =>
    get()
      .nodeIndex.get(nodeId)
      ?.data.fields?.find((f) => f.id === fieldId),
}));

export const selectVisibleNodes = (state: DiagramCollabState) =>
  state.nodes.filter((n) => !n.data?.deleted);

export const selectVisibleEdges = (state: DiagramCollabState) =>
  state.edges.filter((e) => !e.data?.deleted);
