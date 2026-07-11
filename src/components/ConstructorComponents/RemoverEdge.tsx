import trash from "../../assets/trash.svg";
import type { RemoveEdgeData } from "../../types/diagramER";
import { Tooltip } from "antd";

interface Props {
  removeEdgeData: RemoveEdgeData;
  setRemoveEdgeData: React.Dispatch<
    React.SetStateAction<RemoveEdgeData | null>
  >;
  onRemove: (edgeId: string) => void;
}

export default function RemoveEdge({
  removeEdgeData,
  setRemoveEdgeData,
  onRemove,
}: Readonly<Props>) {
  const onRemoveEdgeClick = (edgeId: string) => {
    onRemove(edgeId);
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
