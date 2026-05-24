import { useCallback } from "react";
import { NodeResizer, useReactFlow } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type SectionNodeProps = {
  data: { label: string };
  selected: boolean;
  id: string;
  onBeforeDelete?: () => void;
};

const SectionNode = ({ data, selected, id, onBeforeDelete }: SectionNodeProps) => {
  const { setNodes } = useReactFlow();

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label: e.target.value } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleDelete = useCallback(() => {
    onBeforeDelete?.();
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, onBeforeDelete, setNodes]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "rgba(99, 179, 237, 0.08)",
        border: selected ? "2px dashed #63b3ed" : "2px dashed #a0c4ff",
        borderRadius: 8,
      }}
    >
      <NodeResizer minWidth={200} minHeight={150} isVisible={selected} />
      <input
        value={data.label ?? "Seção"}
        onChange={handleLabelChange}
        style={{
          position: "absolute",
          top: 6,
          left: 10,
          background: "transparent",
          border: "none",
          outline: "none",
          fontWeight: 600,
          fontSize: 13,
          color: "#2b6cb0",
          width: "calc(100% - 40px)",
        }}
        className="nodrag nopan"
      />
      {selected && (
        <DeleteOutlined
          onClick={handleDelete}
          className="nodrag nopan"
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            color: "#B11226",
            cursor: "pointer",
            fontSize: 13,
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};

export default SectionNode;
