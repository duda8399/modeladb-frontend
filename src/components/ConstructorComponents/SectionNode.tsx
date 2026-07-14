import { useCallback, useEffect, useState } from "react";
import { NodeResizer } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type SectionNodeProps = {
  data: { label: string; bgColor?: string };
  selected: boolean;
  id: string;
  onDelete?: () => void;
  onCommitLabel?: (label: string) => void;
  onResize?: (width: number, height: number) => void;
};

const SectionNode = ({
  data,
  selected,
  onDelete,
  onCommitLabel,
  onResize,
}: SectionNodeProps) => {
  const [label, setLabel] = useState(data.label ?? "Seção");
  const [isEditingLabel, setIsEditingLabel] = useState(false);

  useEffect(() => {
    if (!isEditingLabel) setLabel(data.label ?? "Seção");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.label]);

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value),
    [],
  );

  const handleLabelBlur = useCallback(() => {
    setIsEditingLabel(false);
    onCommitLabel?.(label);
  }, [label, onCommitLabel]);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: data.bgColor ?? "rgba(99, 179, 237, 0.08)",
        border: selected ? "2px dashed #63b3ed" : "2px dashed #000",
        borderRadius: 8,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        onResizeEnd={(_, params) => onResize?.(params.width, params.height)}
      />
      <input
        value={label}
        onChange={handleLabelChange}
        onFocus={() => setIsEditingLabel(true)}
        onBlur={handleLabelBlur}
        style={{
          position: "absolute",
          top: 6,
          left: 10,
          background: "transparent",
          border: "none",
          outline: "none",
          fontWeight: 600,
          fontSize: 13,
          color: "#000",
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
