import { useCallback } from "react";
import { BaseEdge, getBezierPath, useStore, type EdgeProps } from "reactflow";
import { getEdgeParams } from "./floatingEdgeUtils";

export default function ViewEdge({ id, source, target, markerEnd }: EdgeProps) {
  const sourceNode = useStore(useCallback((store) => store.nodeInternals.get(source), [source]));
  const targetNode = useStore(useCallback((store) => store.nodeInternals.get(target), [target]));

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{ stroke: "#90A4AE", strokeWidth: 1.5, strokeDasharray: "6 4" }}
    />
  );
}
