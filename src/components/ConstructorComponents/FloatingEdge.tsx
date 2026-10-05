import { useCallback, useEffect, useRef, useState } from "react";
import {
  useStore,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "reactflow";
import { Tooltip } from "antd";
import { getEdgeParams } from "./floatingEdgeUtils";
import { useEdgeActions } from "./EdgeActionsContext";
import trash from "../../assets/trash.svg";

// Tempo que a lixeira continua visivel depois que o mouse sai da aresta, para
// dar tempo de leva-lo ate o botao.
const HIDE_DELAY_MS = 300;

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
  selected,
}: EdgeProps) {
  const { onRemove, readOnly } = useEdgeActions();
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceNode = useStore(
    useCallback((store) => store.nodeInternals.get(source), [source]),
  );
  const targetNode = useStore(
    useCallback((store) => store.nodeInternals.get(target), [target]),
  );

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setHovered(true);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHovered(false), HIDE_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
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

  const active = hovered || selected;
  const showTrash = active && !readOnly;

  return (
    <>
      <g onMouseEnter={show} onMouseLeave={scheduleHide}>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: active ? "#2e7d32" : style?.stroke,
          }}
          interactionWidth={24}
        />
      </g>
      {(label || showTrash) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              display: "flex",
              alignItems: "center",
              gap: 4,
              pointerEvents: "all",
              zIndex: 1001,
            }}
          >
            {label && (
              <div
                style={{
                  background: "#ffffff",
                  border: `1px solid ${active ? "#2e7d32" : "#e0e0e0"}`,
                  borderRadius: 4,
                  padding: "1px 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#333333",
                }}
              >
                {label}
              </div>
            )}
            {showTrash && (
              <Tooltip title="Remover conexão" placement="top">
                <button
                  type="button"
                  aria-label="Remover conexão"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(id);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    border: "none",
                    borderRadius: "50%",
                    backgroundColor: "#d40c48",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img src={trash} alt="" style={{ width: 14, height: 14 }} />
                </button>
              </Tooltip>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
