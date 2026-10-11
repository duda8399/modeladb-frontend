import { useCallback } from "react";
import { useReactFlow } from "reactflow";
import { useDiagramCollabStore, type OperationDraft } from "../../../stores/diagramCollabStore";

export function useNodeFactory(sendOp: (draft: OperationDraft) => void) {
  const { getNodes, screenToFlowPosition } = useReactFlow();

  const nextPosition = useCallback(() => {
    const offset = (getNodes().length % 8) * 40;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: center.x + offset, y: center.y + offset };
  }, [getNodes, screenToFlowPosition]);

  const addNode = useCallback(
    (node: { type: string; data: Record<string, unknown>; style?: Record<string, unknown> }) => {
      const id = crypto.randomUUID();
      sendOp({ type: "ADD_NODE", targetId: id, payload: { id, position: nextPosition(), ...node } });
    },
    [sendOp, nextPosition],
  );

  const addEntityNode = useCallback(
    () => addNode({ type: "entityNode", data: { name: "Entidade", fields: [] } }),
    [addNode],
  );

  const addTextNode = useCallback(
    () => addNode({ type: "textNode", style: { width: 220, height: 100 }, data: { text: "", fontSize: 18 } }),
    [addNode],
  );

  const addSectionNode = useCallback(
    () => addNode({ type: "sectionNode", style: { width: 300, height: 200, zIndex: -1 }, data: { label: "Seção" } }),
    [addNode],
  );

  const addNoteNode = useCallback(() => addNode({ type: "noteNode", data: { text: "" } }), [addNode]);

  const addViewNode = useCallback(() => {
    const viewCount = useDiagramCollabStore
      .getState()
      .nodes.filter((node) => node.type === "viewNode" && !node.data.deleted).length;
    addNode({ type: "viewNode", data: { name: `view_${viewCount + 1}`, sql: "" } });
  }, [addNode]);

  return { addEntityNode, addTextNode, addSectionNode, addNoteNode, addViewNode };
}
