import { useCallback } from "react";
import { NodeResizer, useReactFlow } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type TextNodeProps = {
  data: { text: string };
  selected: boolean;
  id: string;
  onBeforeDelete?: () => void;
};

const TextNode = ({ data, selected, id, onBeforeDelete }: TextNodeProps) => {
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
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: selected ? "1.5px solid #93c5fd" : "1px solid #d1d5db",
        borderRadius: 6,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <NodeResizer minWidth={120} minHeight={70} isVisible={selected} />
      <div
        style={{
          height: 20,
          background: selected ? "#bfdbfe" : "#f3f4f6",
          cursor: "grab",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 6,
        }}
      >
        {selected && (
          <DeleteOutlined
            onClick={handleDelete}
            className="nodrag nopan"
            style={{ color: "#B11226", cursor: "pointer", fontSize: 12 }}
          />
        )}
      </div>
      <textarea
        value={data.text ?? ""}
        onChange={handleChange}
        placeholder="Texto..."
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: "inherit",
          fontSize: 14,
          boxSizing: "border-box",
          padding: "4px 6px",
        }}
        className="nodrag nopan"
      />
    </div>
  );
};

export default TextNode;
