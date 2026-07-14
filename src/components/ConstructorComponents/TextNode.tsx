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
  onDelete?: () => void;
  onCommitText?: (text: string) => void;
  onResize?: (width: number, height: number) => void;
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

const TextNode = ({
  data,
  selected,
  id,
  onDelete,
  onCommitText,
  onResize,
}: TextNodeProps) => {
  const { setNodes } = useReactFlow();
  const editableRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isEmptyLocal, setIsEmptyLocal] = useState(
    !data.text || data.text === "" || data.text === "<br>",
  );
  const isActive = selected || isFocused;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
  }, [id, setNodes]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onCommitText?.(editableRef.current?.innerHTML ?? "");
  }, [onCommitText]);

  useEffect(() => {
    if (isFocused) return;

    const el = editableRef.current;
    if (!el) return;
    const html = toHtml(data.text ?? "");
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
    setIsEmptyLocal(!html);
  }, [data.text, isFocused]);

  const handleInput = useCallback(() => {
    // Ver comentário equivalente em NoteNode.tsx: não tocar o array global de
    // nodes por tecla digitada evita remontar este componente no meio da
    // digitação. O commit colaborativo só acontece no blur.
    const el = editableRef.current;
    if (!el) return;
    setIsEmptyLocal(!el.innerHTML || el.innerHTML === "<br>");
  }, []);

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
      <NodeResizer
        minWidth={120}
        minHeight={70}
        isVisible={isActive}
        onResizeEnd={(_, params) => onResize?.(params.width, params.height)}
      />

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

        {isEmptyLocal && (
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
          onPaste={handlePaste}
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
