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
import type { Dispatch, SetStateAction } from "react";
import type { CustomEdge, CustomNode } from "../../types/diagramER";
import { ExportButton } from "../../components/ConstructorComponents/ExportButton";
import { ImportButton } from "../../components/ConstructorComponents/ImportButton";

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

interface EditorToolbarProps {
  diagramName: string;
  onDiagramNameChange: (name: string) => void;
  onSave: () => void;
  saving?: boolean;
  nodes: CustomNode[];
  edges: CustomEdge[];
  setNodes: Dispatch<SetStateAction<CustomNode[]>>;
  setEdges: Dispatch<SetStateAction<CustomEdge[]>>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBeforeImportReplace: () => void;
  bgColorActive: boolean;
  bgColor: string;
  onBgColorChange: (color: string) => void;
}

export function EditorToolbar({
  diagramName,
  onDiagramNameChange,
  onSave,
  saving = false,
  nodes,
  edges,
  setNodes,
  setEdges,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBeforeImportReplace,
  bgColorActive,
  bgColor,
  onBgColorChange,
}: EditorToolbarProps) {
  const selectedTextNodes = nodes.filter(
    (n) => n.selected && (n.type === "textNode" || n.type === "noteNode"),
  );
  const isTextLike = selectedTextNodes.length > 0;
  const firstData = isTextLike ? (selectedTextNodes[0].data as Record<string, unknown>) : {};

  const updateTextNodes = (patch: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.selected && (n.type === "textNode" || n.type === "noteNode")
          ? { ...n, data: { ...n.data, ...patch } }
          : n,
      ),
    );
  };

  const currentFont = (firstData?.fontFamily as string) ?? "Inter";
  const currentSize = (firstData?.fontSize as number) ?? 14;
  const isBold = !!(firstData?.bold);
  const isItalic = !!(firstData?.italic);
  const isUnderline = !!(firstData?.underline);
  const currentFontColor = (firstData?.fontColor as string) ?? "#000000";
  const currentAlign = (firstData?.textAlign as string) ?? "left";

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
      }}
    >
      <Space size={8}>
        <Select
          value={isTextLike ? currentFont : undefined}
          disabled={!isTextLike}
          style={{ width: 150 }}
          onChange={(val) => updateTextNodes({ fontFamily: val })}
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
          onChange={(val) => updateTextNodes({ fontSize: val })}
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
          onChangeComplete={(color) =>
            updateTextNodes({ fontColor: color.toHexString() })
          }
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
          onClick={() => updateTextNodes({ textAlign: "left" })}
        />
        <Button
          title="Centralizar"
          icon={<AlignCenterOutlined />}
          disabled={!isTextLike}
          type={currentAlign === "center" ? "primary" : "default"}
          onClick={() => updateTextNodes({ textAlign: "center" })}
        />
        <Button
          title="Alinhar à direita"
          icon={<AlignRightOutlined />}
          disabled={!isTextLike}
          type={currentAlign === "right" ? "primary" : "default"}
          onClick={() => updateTextNodes({ textAlign: "right" })}
        />
        <Button
          title="Justificado"
          icon={<MdFormatAlignJustify style={{ fontSize: 14 }} />}
          disabled={!isTextLike}
          type={currentAlign === "justify" ? "primary" : "default"}
          onClick={() => updateTextNodes({ textAlign: "justify" })}
        />

        <ColorPicker
          value={bgColor}
          onChangeComplete={(color) => onBgColorChange(color.toHexString())}
        >
          <Button
            title="Adicionar cor de fundo"
            icon={<BgColorsOutlined />}
            type={bgColorActive ? "primary" : "default"}
            style={bgColorActive ? { borderColor: bgColor, color: bgColor } : {}}
          />
        </ColorPicker>

        <Divider type="vertical" />

        <Button title="Compartilhar diagrama" icon={<LinkOutlined />} />
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

      <Space>
        <input
          value={diagramName}
          onChange={(e) => onDiagramNameChange(e.target.value)}
          placeholder="Nome do diagrama"
          style={{
            width: 220,
            height: 32,
            border: "1px solid #d9d9d9",
            borderRadius: 6,
            padding: "0 10px",
            fontSize: 14,
          }}
        />

        <Divider type="vertical" />

        <Button type="primary" onClick={onSave} loading={saving}>
          Salvar
        </Button>
        <ImportButton
          diagramName={diagramName}
          onDiagramNameChange={onDiagramNameChange}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onBeforeImportReplace={onBeforeImportReplace}
        />
        <ExportButton diagramName={diagramName} nodes={nodes} edges={edges} />
      </Space>
    </div>
  );
}
