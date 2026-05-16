import trash from "../../assets/trash.svg";
import type { CustomEdge, RemoveEdgeData } from "../../types/diagramER";
import { Tooltip } from "antd";
import { useReactFlow } from "reactflow";

interface Props {
  removeEdgeData: RemoveEdgeData;
  setRemoveEdgeData: React.Dispatch<
    React.SetStateAction<RemoveEdgeData | null>
  >;
  onBeforeRemoveEdge?: () => void;
}

export default function RemoveEdge({
  removeEdgeData,
  setRemoveEdgeData,
  onBeforeRemoveEdge,
}: Readonly<Props>) {
  const { setEdges, setNodes, getEdges } = useReactFlow();

  const onRemoveEdgeClick = (edgeId: string) => {
    onBeforeRemoveEdge?.();

    const edgeToRemove = getEdges().find((edge) => edge.id === edgeId) as
      | CustomEdge
      | undefined;

    if (edgeToRemove?.data?.relationType === "N:N" && edgeToRemove.data.junctionId) {
      const junctionId = edgeToRemove.data.junctionId;

      setEdges((edges) =>
        edges.filter(
          (edge) =>
            edge.id !== edgeId &&
            edge.source !== junctionId &&
            edge.target !== junctionId,
        ),
      );

      setNodes((nodes) => nodes.filter((node) => node.id !== junctionId));
      setRemoveEdgeData(null);
      return;
    }

    if (
      edgeToRemove?.data?.relationType === "1:1" ||
      edgeToRemove?.data?.relationType === "1:N"
    ) {
      const sourceNodeId = edgeToRemove.data?.sourceNodeId ?? edgeToRemove.source;
      const targetNodeId = edgeToRemove.data?.targetNodeId ?? edgeToRemove.target;
      const fkFieldName = edgeToRemove.data?.fkFieldName;

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== targetNodeId) {
            return node;
          }

          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          const sourceName = (sourceNode?.data as any)?.name || sourceNodeId;

          const currentFields = ((node.data as any)?.fields || []) as Array<{ name?: string; fk?: boolean }>;
          const fields = currentFields.filter((field) => {
            if (!field?.fk) return true;
            if (fkFieldName) return field.name !== fkFieldName;
            return field.name !== `fk_${sourceName}_id`;
          });

          return {
            ...node,
            data: {
              ...(node.data as any),
              fields,
            },
          };
        }),
      );
    }

    setEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
    setRemoveEdgeData(null);
  };

  return (
    <Tooltip title="Remover conexão" placement="top">
      <button
        onClick={() => onRemoveEdgeClick(removeEdgeData.edgeId)}
        aria-label="Remover conexão"
        style={{
          position: "absolute",
          left: removeEdgeData.x,
          top: removeEdgeData.y,
          transform: "translate(-50%, -50%)",
          backgroundColor: "#d40c48",
          borderRadius: "50%",
          padding: "8px",
          cursor: "pointer",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={trash}
          alt="trash"
        />
      </button>
    </Tooltip>
  );
}
