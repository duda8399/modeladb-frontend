import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { CustomEdge, CustomNode, Field } from "../../../types/diagramER";
import {
  useDiagramCollabStore,
  selectVisibleNodes,
  selectVisibleEdges,
  type CollabEdge,
  type Operation,
  type OperationDraft,
} from "../../../stores/diagramCollabStore";
import { diffFields, visibleFields } from "../../../utils/fieldOps";
import { hasPrimaryKey, isLastPrimaryKey } from "../../../utils/primaryKey";
import { nameError } from "../../../utils/entityNames";
import { introducesDuplicateFieldName } from "../../../utils/fieldNames";
import { resolveDirectFkLinks, type FkEdgeLike, type FkNodeLike } from "../../../utils/foreignKeys";
import type { RelationshipChanges } from "../../../components/ConstructorComponents/RelationshipModal";

type Params = {
  userId: string;
  readOnly: boolean;
  emitOperation: (op: Operation) => void;
  setNodes: Dispatch<SetStateAction<CustomNode[]>>;
  setEdges: Dispatch<SetStateAction<CustomEdge[]>>;
};

function currentDirectLinks() {
  const state = useDiagramCollabStore.getState();
  return resolveDirectFkLinks(
    selectVisibleNodes(state) as unknown as FkNodeLike[],
    selectVisibleEdges(state) as unknown as FkEdgeLike[],
  );
}

export function useDiagramOperations({ userId, readOnly, emitOperation, setNodes, setEdges }: Params) {
  const syncFromStore = useCallback(() => {
    const state = useDiagramCollabStore.getState();
    const visibleNodes = selectVisibleNodes(state);
    const visibleEdges = selectVisibleEdges(state);

    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));

      return visibleNodes.map((storeNode) => ({
        ...(byId.get(storeNode.id) || {}),
        id: storeNode.id,
        type: storeNode.type,
        position: storeNode.position,
        style: storeNode.style,
        data: {
          ...storeNode.data,
          ...(storeNode.data.fields !== undefined
            ? { fields: visibleFields(storeNode.data.fields) as Field[] }
            : {}),
        },
      }) as CustomNode);
    });

    setEdges((current) => {
      const byId = new Map(current.map((e) => [e.id, e]));

      return visibleEdges.map((storeEdge) => ({
        ...(byId.get(storeEdge.id) || {}),
        id: storeEdge.id,
        source: storeEdge.source,
        sourceHandle: storeEdge.sourceHandle,
        target: storeEdge.target,
        label: storeEdge.label,
        type: storeEdge.type,
        data: storeEdge.data,
      }) as CustomEdge);
    });
  }, [setEdges, setNodes]);

  const sendOp = useCallback(
    (draft: OperationDraft) => {
      if (!userId || readOnly) return;

      const store = useDiagramCollabStore.getState();
      const op = store.stampOperation(draft, userId);
      store.applyOperation(op);
      emitOperation(op);
      syncFromStore();
    },
    [userId, readOnly, emitOperation, syncFromStore],
  );

  const applyRemoteOperation = useCallback(
    (op: Operation) => {
      useDiagramCollabStore.getState().applyOperation(op, false);
      syncFromStore();
    },
    [syncFromStore],
  );

  const deleteEdgeWithCascade = useCallback(
    (edgeId: string) => {
      const store = useDiagramCollabStore.getState();
      const edge = store.getEdge(edgeId);
      if (!edge) return;

      if (edge.data?.junctionId) {
        const junctionId = edge.data.junctionId;
        const siblingEdges = store.edges.filter(
          (e) =>
            !e.data?.deleted &&
            e.id !== edgeId &&
            (e.source === junctionId || e.target === junctionId),
        );

        siblingEdges.forEach((sibling) => sendOp({ type: "DELETE_EDGE", targetId: sibling.id }));
        sendOp({ type: "DELETE_EDGE", targetId: edgeId });
        sendOp({ type: "DELETE_NODE", targetId: junctionId });
        return;
      }

      if (edge.data?.relationType === "1:1" || edge.data?.relationType === "1:N") {
        const link = currentDirectLinks().get(edgeId);

        if (link?.field?.fk) {
          const childFields = store.getNode(link.childId)?.data.fields as Field[] | undefined;
          if (isLastPrimaryKey(childFields, link.field.id)) {
            sendOp({
              type: "SET_FIELD_PROP",
              targetId: link.childId,
              payload: { fieldId: link.field.id, key: "fk", value: false },
              previousValue: true,
            });
          } else {
            sendOp({ type: "REMOVE_FIELD", targetId: link.childId, payload: { fieldId: link.field.id } });
          }
        }
      }

      sendOp({ type: "DELETE_EDGE", targetId: edgeId });
    },
    [sendOp],
  );

  const deleteNodeWithCascade = useCallback(
    (nodeId: string) => {
      useDiagramCollabStore
        .getState()
        .edges.filter((e) => !e.data?.deleted && (e.source === nodeId || e.target === nodeId))
        .forEach((edge) => deleteEdgeWithCascade(edge.id));
      sendOp({ type: "DELETE_NODE", targetId: nodeId });
    },
    [deleteEdgeWithCascade, sendOp],
  );

  const setNodeProp = useCallback(
    (nodeId: string, key: string, value: unknown): boolean => {
      const store = useDiagramCollabStore.getState();
      const node = store.getNode(nodeId);
      if (!node) return false;

      const previousValue = (node.data as Record<string, unknown>)[key];
      if (previousValue === value) return true;

      if (
        key === "name" &&
        (node.type === "entityNode" || node.type === "viewNode") &&
        nameError(store.nodes, String(value ?? ""), nodeId)
      ) {
        return false;
      }

      sendOp({ type: "SET_NODE_PROP", targetId: nodeId, payload: { key, value }, previousValue });
      return true;
    },
    [sendOp],
  );

  const resizeNode = useCallback(
    (nodeId: string, width: number, height: number) => {
      const node = useDiagramCollabStore.getState().getNode(nodeId);
      if (!node) return;

      const style = node.style as Record<string, unknown> | undefined;

      sendOp({
        type: "RESIZE_NODE",
        targetId: nodeId,
        payload: { width, height },
        previousSize: {
          width: style?.width as number | undefined,
          height: style?.height as number | undefined,
        },
      });
    },
    [sendOp],
  );

  const onFieldsChange = useCallback(
    (nodeId: string, newFields: Field[]) => {
      const node = useDiagramCollabStore.getState().getNode(nodeId);
      if (!node) return;
      const currentFields = visibleFields(node.data.fields);
      if (!hasPrimaryKey(newFields) && hasPrimaryKey(currentFields)) return;
      if (introducesDuplicateFieldName(currentFields, newFields)) return;

      const linksBefore = currentDirectLinks();
      const fieldOps = diffFields(nodeId, node.data.fields, newFields);
      fieldOps.forEach(sendOp);

      fieldOps
        .filter((op) => op.type === "SET_FIELD_PROP" && op.payload?.key === "name")
        .forEach((op) => {
          for (const link of linksBefore.values()) {
            if (link.childId !== nodeId || link.field?.id !== op.payload.fieldId) continue;
            const edge = useDiagramCollabStore.getState().getEdge(link.edgeId);
            if (!edge?.data) continue;

            if (op.payload.value && edge.data.fkFieldName !== op.payload.value) {
              sendOp({
                type: "SET_EDGE_PROP",
                targetId: edge.id,
                payload: { key: "fkFieldName", value: op.payload.value },
                previousValue: edge.data.fkFieldName,
              });
            }
            if (!edge.data.fkFieldId) {
              sendOp({
                type: "SET_EDGE_PROP",
                targetId: edge.id,
                payload: { key: "fkFieldId", value: op.payload.fieldId },
                previousValue: undefined,
              });
            }
          }
        });
    },
    [sendOp],
  );

  const moveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }, previousPosition?: { x: number; y: number }) => {
      if (previousPosition && previousPosition.x === position.x && previousPosition.y === position.y) return;

      sendOp({
        type: "MOVE_NODE",
        targetId: nodeId,
        payload: { x: position.x, y: position.y },
        previousPosition: previousPosition ?? position,
      });
    },
    [sendOp],
  );

  const handleUndo = useCallback(() => {
    const op = useDiagramCollabStore.getState().undo(userId);
    if (!op) return;
    emitOperation(op);
    syncFromStore();
  }, [userId, emitOperation, syncFromStore]);

  const handleRedo = useCallback(() => {
    const op = useDiagramCollabStore.getState().redo(userId);
    if (!op) return;
    emitOperation(op);
    syncFromStore();
  }, [userId, emitOperation, syncFromStore]);

  const findFkField = useCallback((edge: CollabEdge) => {
    const state = useDiagramCollabStore.getState();
    const data = edge.data;
    if (!data) return { childNode: undefined, parentNode: undefined, fkField: undefined };

    if (data.junctionId) {
      const junction = state.getNode(data.junctionId);
      const parentId = edge.target === data.junctionId ? edge.source : edge.target;
      const parentNode = state.getNode(parentId);
      const expected = `fk_${parentNode?.data.name ?? ""}_id`.toLowerCase();
      const fkField = (junction?.data.fields ?? []).find(
        (f) => !f.deleted && f.fk && f.name?.toLowerCase() === expected,
      );
      return { childNode: junction, parentNode, fkField };
    }

    const childNode = state.getNode(data.targetNodeId ?? edge.target);
    const parentNode = state.getNode(data.sourceNodeId ?? edge.source);
    const linkedId = currentDirectLinks().get(edge.id)?.field?.id;
    const fkField = (childNode?.data.fields ?? []).find((f) => !f.deleted && f.id === linkedId);
    return { childNode, parentNode, fkField };
  }, []);

  const saveRelationship = useCallback(
    (edgeId: string, changes: RelationshipChanges) => {
      const edge = useDiagramCollabStore.getState().getEdge(edgeId);
      if (!edge?.data) return;

      (["onDelete", "onUpdate"] as const).forEach((key) => {
        const previousValue = edge.data?.[key] ?? null;
        if (previousValue === changes[key]) return;
        sendOp({ type: "SET_EDGE_PROP", targetId: edgeId, payload: { key, value: changes[key] }, previousValue });
      });

      const { childNode, fkField } = findFkField(edge);
      if (!edge.data.junctionId && childNode && fkField && !fkField.pk && fkField.notNull !== changes.required) {
        sendOp({
          type: "SET_FIELD_PROP",
          targetId: childNode.id,
          payload: { fieldId: fkField.id, key: "notNull", value: changes.required },
          previousValue: fkField.notNull,
        });
      }
    },
    [findFkField, sendOp],
  );

  return useMemo(
    () => ({
      syncFromStore,
      sendOp,
      applyRemoteOperation,
      deleteEdgeWithCascade,
      deleteNodeWithCascade,
      setNodeProp,
      resizeNode,
      onFieldsChange,
      moveNode,
      handleUndo,
      handleRedo,
      findFkField,
      saveRelationship,
    }),
    [
      syncFromStore,
      sendOp,
      applyRemoteOperation,
      deleteEdgeWithCascade,
      deleteNodeWithCascade,
      setNodeProp,
      resizeNode,
      onFieldsChange,
      moveNode,
      handleUndo,
      handleRedo,
      findFkField,
      saveRelationship,
    ],
  );
}
