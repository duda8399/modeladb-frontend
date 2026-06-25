import { useCallback } from "react";
import {
  useStore,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "reactflow";
import { getEdgeParams } from "./floatingEdgeUtils";

// Aresta "flutuante": calcula os pontos de conexao nas bordas dos nos com base
// na posicao deles, em vez de usar um handle fixo. Quem e source/target NAO
// muda (continua definido pela ordem do clique); muda apenas o lado em que a
// linha encosta, sempre o que esta de frente para a outra tabela.
export default function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
}: EdgeProps) {
  const sourceNode = useStore(
    useCallback((store) => store.nodeInternals.get(source), [source]),
  );
  const targetNode = useStore(
    useCallback((store) => store.nodeInternals.get(target), [target]),
  );

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "#ffffff",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 12,
              fontWeight: 600,
              color: "#333333",
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
