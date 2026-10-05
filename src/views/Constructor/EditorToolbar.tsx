import { Button, ColorPicker, Divider, Select, Space } from "antd";
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BgColorsOutlined,
  BoldOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { SlActionRedo, SlActionUndo } from "react-icons/sl";
import { MdFormatAlignJustify } from "react-icons/md";
import { startTrackingSelection, restoreSelection } from "../../utils/selectionUtils";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CustomEdge, CustomNode } from "../../types/diagramER";
import { ExportButton } from "../../components/ConstructorComponents/ExportButton";
import { ImportButton } from "../../components/ConstructorComponents/ImportButton";
import type { PresenceUser } from "../../services/realtimeService";
import { colorForUserId, initialFor } from "../../utils/presence";

const fontGroups = [
  {
    label: "Sans-serif",
    options: [
      "Inter",
      "Roboto",
      "Open Sans",
      "Lato",
      "Montserrat",
      "Poppins",
      "Raleway",
      "Nunito",
      "Arial",
      "Helvetica",
      "Verdana",
      "Trebuchet MS",
    ],
  },
  {
    label: "Serif",
    options: ["Times New Roman", "Georgia", "Playfair Display", "Merriweather"],
  },
  {
    label: "Monospace",
    options: ["Source Code Pro", "Courier New"],
  },
];

const sizeOptions = [
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 11, label: "11" },
  { value: 12, label: "12" },
  { value: 13, label: "13" },
  { value: 14, label: "14" },
  { value: 15, label: "15" },
  { value: 16, label: "16" },
  { value: 18, label: "18" },
  { value: 20, label: "20" },
  { value: 22, label: "22" },
  { value: 24, label: "24" },
  { value: 28, label: "28" },
  { value: 32, label: "32" },
  { value: 36, label: "36" },
  { value: 48, label: "48" },
  { value: 64, label: "64" },
  { value: 72, label: "72" },
];

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface EditorToolbarProps {
  diagramName: string;
  onDiagramNameChange: (name: string) => void;
  onSave: () => void;
  saving?: boolean;
  saveStatus?: SaveStatus;
  lastSavedAt?: Date | null;
  nodes: CustomNode[];
  edges: CustomEdge[];
  setNodes: Dispatch<SetStateAction<CustomNode[]>>;
  setEdges: Dispatch<SetStateAction<CustomEdge[]>>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBeforeImportReplace: () => void;
  onPatchSelectedTextNodes: (patch: Record<string, unknown>) => void;
  onlineUsers: PresenceUser[];
  onOpenShare: () => void;
  readOnly?: boolean;
  bgColorActive: boolean;
  bgColor: string;
  onBgColorChange: (color: string) => void;
}

export function EditorToolbar({
  diagramName,
  onDiagramNameChange,
  onSave,
  saving = false,
  saveStatus = "idle",
  lastSavedAt = null,
  nodes,
  edges,
  setNodes,
  setEdges,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBeforeImportReplace,
  onPatchSelectedTextNodes,
  onlineUsers,
  onOpenShare,
  readOnly = false,
  bgColorActive,
  bgColor,
  onBgColorChange,
}: EditorToolbarProps) {
  useEffect(() => startTrackingSelection(), []);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) {
        setActiveFont(undefined);
        setActiveFontSize(undefined);
        setActiveBold(undefined);
        setActiveItalic(undefined);
        setActiveUnderline(undefined);
        setActiveAlign(undefined);
        return;
      }
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const el = (
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element)
      ) as HTMLElement | null;
      if (!el?.closest("[contenteditable]")) {
        setActiveFont(undefined);
        setActiveFontSize(undefined);
        setActiveBold(undefined);
        setActiveItalic(undefined);
        setActiveUnderline(undefined);
        setActiveAlign(undefined);
        return;
      }
      const computed = window.getComputedStyle(el);
      const rawFont = computed.fontFamily.split(",")[0].trim().replace(/['"]/g, "");
      const fontSize = parseFloat(computed.fontSize);
      if (rawFont) setActiveFont(rawFont);
      if (!isNaN(fontSize)) setActiveFontSize(Math.round(fontSize));
      setActiveBold(parseInt(computed.fontWeight) >= 700 || computed.fontWeight === "bold");
      setActiveItalic(computed.fontStyle === "italic");
      setActiveUnderline(computed.textDecorationLine.includes("underline"));
      setActiveAlign(computed.textAlign || undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  const selectedTextNodes = nodes.filter(
    (n) => n.selected && (n.type === "textNode" || n.type === "noteNode"),
  );
  const isTextLike = selectedTextNodes.length > 0;
  const firstData = isTextLike ? (selectedTextNodes[0].data as Record<string, unknown>) : {};
  const selectedNodeId = selectedTextNodes[0]?.id ?? null;

  const [activeFont, setActiveFont] = useState<string | undefined>(undefined);
  const [activeFontSize, setActiveFontSize] = useState<number | undefined>(undefined);
  const [activeBold, setActiveBold] = useState<boolean | undefined>(undefined);
  const [activeItalic, setActiveItalic] = useState<boolean | undefined>(undefined);
  const [activeUnderline, setActiveUnderline] = useState<boolean | undefined>(undefined);
  const [activeAlign, setActiveAlign] = useState<string | undefined>(undefined);

  useEffect(() => {
    setActiveFont(undefined);
    setActiveFontSize(undefined);
    setActiveBold(undefined);
    setActiveItalic(undefined);
    setActiveUnderline(undefined);
    setActiveAlign(undefined);
  }, [selectedNodeId]);

  const updateTextNodes = (patch: Record<string, unknown>) => {
    onPatchSelectedTextNodes(patch);
  };

  const currentFont = activeFont ?? ((firstData?.fontFamily as string));
  const currentSize = activeFontSize ?? ((firstData?.fontSize as number));
  const isBold = activeBold ?? !!(firstData?.bold);
  const isItalic = activeItalic ?? !!(firstData?.italic);
  const isUnderline = activeUnderline ?? !!(firstData?.underline);
  const currentFontColor = (firstData?.fontColor as string) ?? "#000000";
  const currentAlign = activeAlign;

  return (
    <div
      style={{
        minHeight: 48,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        rowGap: 8,
        padding: "8px 16px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
      }}
    >
      <Space size={8} wrap>
        <Select
          value={isTextLike ? currentFont : undefined}
          disabled={!isTextLike}
          style={{ width: 150 }}
          onChange={(val) => {
            setActiveFont(val);
            if (restoreSelection()) {
              document.execCommand("fontName", false, val);
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ fontFamily: val });
            }
          }}
          options={fontGroups.map((group) => ({
            label: group.label,
            options: group.options.map((font) => ({
              value: font,
              label: <span style={{ fontFamily: font }}>{font}</span>,
            })),
          }))}
        />

        <Select
          value={isTextLike ? currentSize : undefined}
          disabled={!isTextLike}
          style={{ width: 70 }}
          options={sizeOptions}
          onChange={(val) => {
            setActiveFontSize(val);
            if (restoreSelection()) {
              document.execCommand("fontSize", false, "7");
              const activeEl = document.activeElement;
              const spans: HTMLElement[] = [];
              activeEl?.querySelectorAll('font[size="7"]').forEach((fontEl) => {
                const span = document.createElement("span");
                span.style.fontSize = `${val}px`;
                const face = (fontEl as HTMLElement).getAttribute("face");
                if (face) span.style.fontFamily = face;
                span.innerHTML = (fontEl as HTMLElement).innerHTML;
                fontEl.parentNode?.replaceChild(span, fontEl);
                spans.push(span);
              });
              if (spans.length > 0) {
                const sel = window.getSelection();
                if (sel) {
                  const range = document.createRange();
                  range.setStartBefore(spans[0]);
                  range.setEndAfter(spans[spans.length - 1]);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
              activeEl?.dispatchEvent(new Event("input", { bubbles: true }));
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ fontSize: val });
            }
          }}
        />

        <Button
          title="Negrito"
          icon={<BoldOutlined />}
          disabled={!isTextLike}
          type={isBold ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {
              document.execCommand("bold");
            } else {
              updateTextNodes({ bold: !isBold });
            }
          }}
        />
        <Button
          title="Itálico"
          icon={<ItalicOutlined />}
          disabled={!isTextLike}
          type={isItalic ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {
              document.execCommand("italic");
            } else {
              updateTextNodes({ italic: !isItalic });
            }
          }}
        />
        <Button
          title="Sublinhado"
          icon={<UnderlineOutlined />}
          disabled={!isTextLike}
          type={isUnderline ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {
              document.execCommand("underline");
            } else {
              updateTextNodes({ underline: !isUnderline });
            }
          }}
        />

        <ColorPicker
          value={currentFontColor}
          disabled={!isTextLike}
          onChangeComplete={(color) => {
            if (restoreSelection()) {
              document.execCommand("foreColor", false, color.toHexString());
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ fontColor: color.toHexString() });
            }
          }}
        >
          <Button
            title="Cor da Fonte"
            icon={<FontColorsOutlined />}
            disabled={!isTextLike}
            style={isTextLike ? { color: currentFontColor } : {}}
          />
        </ColorPicker>

        <Button
          title="Alinhar à esquerda"
          icon={<AlignLeftOutlined />}
          disabled={!isTextLike}
          type={currentAlign === "left" ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (restoreSelection()) {
              document.execCommand("justifyLeft");
            } else {
              updateTextNodes({ textAlign: "left" });
            }
          }}
        />
        <Button
          title="Centralizar"
          icon={<AlignCenterOutlined />}
          disabled={!isTextLike}
          type={currentAlign === "center" ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (restoreSelection()) {
              document.execCommand("justifyCenter");
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ textAlign: "center" });
            }
          }}
        />
        <Button
          title="Alinhar à direita"
          icon={<AlignRightOutlined />}
          disabled={!isTextLike}
          type={currentAlign === "right" ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (restoreSelection()) {
              document.execCommand("justifyRight");
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ textAlign: "right" });
            }
          }}
        />
        <Button
          title="Justificado"
          icon={<MdFormatAlignJustify style={{ fontSize: 14 }} />}
          disabled={!isTextLike}
          type={currentAlign === "justify" ? "primary" : "default"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (restoreSelection()) {
              document.execCommand("justifyFull");
              setTimeout(() => restoreSelection(), 0);
            } else {
              updateTextNodes({ textAlign: "justify" });
            }
          }}
        />

        <ColorPicker
          value={bgColor}
          onChangeComplete={(color) => onBgColorChange(color.toHexString())}
        >
          <Button
            title="Adicionar cor de fundo"
            icon={<BgColorsOutlined />}
            type={bgColorActive ? "primary" : "default"}
            style={bgColorActive ? { color: '#fff' } : {}}
            disabled={readOnly}
          />
        </ColorPicker>

        <Divider type="vertical" />

        {onlineUsers.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", marginRight: 4 }}>
            {onlineUsers.map((user) => (
              <div
                key={user.userId}
                title={user.email || user.userId}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: colorForUserId(user.userId),
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "2px solid #fff",
                  marginLeft: -8,
                }}
              >
                {initialFor(user.email || user.userId)}
              </div>
            ))}
          </div>
        )}

        <Button
          title="Compartilhar diagrama"
          icon={<LinkOutlined />}
          onClick={onOpenShare}
        />
        <Button
          title="Desfazer"
          icon={<SlActionUndo />}
          onClick={onUndo}
          disabled={!canUndo}
        />
        <Button
          title="Refazer"
          icon={<SlActionRedo />}
          onClick={onRedo}
          disabled={!canRedo}
        />
      </Space>

      <Space wrap>
        <SaveStatusText status={saveStatus} lastSavedAt={lastSavedAt} />
        <Button type="primary" onClick={onSave} loading={saving} disabled={readOnly}>
          Salvar
        </Button>
        {!readOnly && (
          <ImportButton
            diagramName={diagramName}
            onDiagramNameChange={onDiagramNameChange}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            onBeforeImportReplace={onBeforeImportReplace}
          />
        )}
        <ExportButton diagramName={diagramName} nodes={nodes} edges={edges} />
      </Space>
    </div>
  );
}

function SaveStatusText({
  status,
  lastSavedAt,
}: {
  status: SaveStatus;
  lastSavedAt: Date | null;
}) {
  const time = lastSavedAt?.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const content: Record<SaveStatus, { text: string; color: string } | null> = {
    idle: null,
    pending: { text: "Alterações não salvas", color: "#8c8c8c" },
    saving: { text: "Salvando...", color: "#8c8c8c" },
    saved: { text: time ? `Salvo às ${time}` : "Salvo", color: "#2e7d32" },
    error: { text: "Erro ao salvar", color: "#d40c48" },
  };

  const current = content[status];
  if (!current) return null;

  return (
    <span
      aria-live="polite"
      style={{ fontSize: 13, color: current.color, whiteSpace: "nowrap" }}
    >
      {current.text}
    </span>
  );
}
