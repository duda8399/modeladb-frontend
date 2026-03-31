import trash from "../../assets/trash.svg";
import type { RemoveEdgeData } from "../../types/diagramER";
import { Tooltip } from "antd";
import { useReactFlow } from "reactflow";

interface Props {
  removeEdgeData: RemoveEdgeData;
  setRemoveEdgeData: React.Dispatch<
    React.SetStateAction<RemoveEdgeData | null>
  >;
}

export default function RemoveEdge({
  removeEdgeData,
  setRemoveEdgeData,
}: Readonly<Props>) {
  const { setEdges } = useReactFlow();

  const onRemoveEdgeClick = (edgeId: string) => {
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
