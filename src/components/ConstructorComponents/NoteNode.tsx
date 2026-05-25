import { useCallback } from "react";
import { NodeResizer, useReactFlow } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type NoteNodeProps = {
  data: { text: string };
  selected: boolean;
  id: string;
  onBeforeDelete?: () => void;
};

const NoteNode = ({ data, selected, id, onBeforeDelete }: NoteNodeProps) => {
  const { setNodes } = useReactFlow();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, text: e.target.value } } : n,
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
        background: "#fef9c3",
        border: selected ? "1.5px dashed #facc15" : "1px solid #fde68a",
        borderRadius: 8,
        padding: 8,
        minWidth: 150,
        minHeight: 80,
        height: "100%",
        boxShadow: "2px 2px 6px rgba(0,0,0,0.1)",
        position: "relative",
      }}
    >
      <NodeResizer minWidth={150} minHeight={80} isVisible={selected} />
      {selected && (
        <DeleteOutlined
          onClick={handleDelete}
          className="nodrag nopan"
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            color: "#B11226",
            cursor: "pointer",
            fontSize: 13,
            zIndex: 10,
          }}
        />
      )}
      <textarea
        value={data.text ?? ""}
        onChange={handleChange}
        placeholder="Escreva uma nota..."
        style={{
          width: "100%",
          height: "100%",
          minHeight: 64,
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: "inherit",
          fontSize: 13,
          boxSizing: "border-box",
          paddingRight: selected ? 20 : 0,
        }}
      />
    </div>
  );
};

export default NoteNode;
