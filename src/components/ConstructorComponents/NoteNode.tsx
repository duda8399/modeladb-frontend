import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, useReactFlow } from "reactflow";
import { DeleteOutlined } from "@ant-design/icons";

type NoteNodeProps = {
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
  onDelete?: () => void;
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

const NoteNode = ({ data, selected, id, onDelete }: NoteNodeProps) => {
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

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    editableRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const isEmpty = !data.text || data.text === "" || data.text === "<br>";

  return (
    <div
      style={{
        background: data.textBgColor || "#fef9c3",
        border: isActive ? "1.5px dashed #facc15" : "1px solid #fde68a",
        borderRadius: 8,
        padding: 8,
        minWidth: 150,
        minHeight: 80,
        height: "100%",
        boxShadow: "2px 2px 6px rgba(0,0,0,0.1)",
        position: "relative",
      }}
    >
      <NodeResizer minWidth={150} minHeight={80} isVisible={isActive} />
      {isActive && (
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

      {isEmpty && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 8,
            color: "#bbb",
            pointerEvents: "none",
            fontFamily: data.fontFamily ?? "inherit",
            fontSize: data.fontSize ?? 13,
            userSelect: "none",
          }}
        >
          Escreva uma nota...
        </div>
      )}

      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          width: "100%",
          minHeight: 64,
          height: "100%",
          background: "transparent",
          outline: "none",
          boxSizing: "border-box",
          paddingRight: isActive ? 20 : 0,
          fontFamily: data.fontFamily ?? "inherit",
          fontSize: data.fontSize ?? 13,
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
  );
};

export default NoteNode;
