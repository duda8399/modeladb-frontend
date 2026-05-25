import { Button, ColorPicker, Divider, Select, Space } from "antd";
import {
  AlignCenterOutlined,
  BgColorsOutlined,
  BoldOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { SlActionRedo, SlActionUndo } from "react-icons/sl";
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
  fontColor: string;
  onFontColorChange: (color: string) => void;
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
  fontColor,
  onFontColorChange,
}: EditorToolbarProps) {
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
          defaultValue="Inter"
          style={{ width: 150 }}
          options={fontGroups.map((group) => ({
            label: group.label,
            options: group.options.map((font) => ({
              value: font,
              label: <span style={{ fontFamily: font }}>{font}</span>,
            })),
          }))}
        />

        <Select defaultValue={14} style={{ width: 70 }} options={sizeOptions} />

        <Button title="Negrito" icon={<BoldOutlined />} />
        <Button title="Itálico" icon={<ItalicOutlined />} />
        <Button title="Sublinhado" icon={<UnderlineOutlined />} />
        <ColorPicker
          value={fontColor}
          onChangeComplete={(color) => onFontColorChange(color.toHexString())}
        >
          <Button
            title="Cor da Fonte"
            icon={<FontColorsOutlined />}
            style={{ color: fontColor }}
          />
        </ColorPicker>
        <Button title="Alinhar ao Centro" icon={<AlignCenterOutlined />} />
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
