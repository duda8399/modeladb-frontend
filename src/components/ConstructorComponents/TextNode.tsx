import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, useReactFlow } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type TextNodeProps = {
  data: {
    text: string;
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontColor?: string;
    textAlign?: "left" | "center" | "right" | "justify";
    textBgColor?: string;
  };
  selected: boolean;
  id: string;
  onBeforeDelete?: () => void;
};

function toHtml(text: string): string {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

const TextNode = ({ data, selected, id, onBeforeDelete }: TextNodeProps) => {
  const { setNodes } = useReactFlow();
  const editableRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isActive = selected || isFocused;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
  }, [id, setNodes]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const html = toHtml(data.text ?? "");
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, [data.text]);

  const handleInput = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, text: el.innerHTML } } : n,
      ),
    );
  }, [id, setNodes]);

  const handleDelete = useCallback(() => {
    onBeforeDelete?.();
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, onBeforeDelete, setNodes]);

  const isEmpty = !data.text || data.text === "" || data.text === "<br>";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: "none",
        borderRadius: 6,
        background: data.textBgColor || "transparent",
        overflow: "hidden",
      }}
    >
      <NodeResizer minWidth={120} minHeight={70} isVisible={isActive} />

      <div style={{ position: "relative", flex: 1 }}>
        {isActive && (
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

        {isEmpty && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 6,
              color: "#aaa",
              pointerEvents: "none",
              fontFamily: data.fontFamily ?? "inherit",
              fontSize: data.fontSize ?? 14,
              userSelect: "none",
            }}
          >
            Texto...
          </div>
        )}

        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            outline: "none",
            boxSizing: "border-box",
            padding: "8px 28px 8px 6px",
            fontFamily: data.fontFamily ?? "inherit",
            fontSize: data.fontSize ?? 14,
            fontWeight: data.bold ? "bold" : "normal",
            fontStyle: data.italic ? "italic" : "normal",
            textDecoration: data.underline ? "underline" : "none",
            color: data.fontColor ?? "inherit",
            textAlign: data.textAlign ?? "left",
            cursor: "text",
            wordBreak: "break-word",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
          className="nodrag nopan"
        />
      </div>
    </div>
  );
};

export default TextNode;
