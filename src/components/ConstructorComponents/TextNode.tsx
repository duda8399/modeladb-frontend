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
        border: "none",
        borderRadius: 6,
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <NodeResizer minWidth={120} minHeight={70} isVisible={selected} />

      <div
        style={{
          position: "relative",
          flex: 1,
        }}
      >
        {selected && (
          <DeleteOutlined
            onClick={handleDelete}
            className="nodrag nopan"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 1,
              color: "#B11226",
              cursor: "pointer",
              fontSize: 12,
            }}
          />
        )}

        <textarea
          value={data.text ?? ""}
          onChange={handleChange}
          placeholder="Texto..."
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: "inherit",
            fontSize: 14,
            boxSizing: "border-box",
            padding: "8px 28px 8px 6px",
          }}
        />
      </div>
    </div>
  );
};

export default TextNode;
