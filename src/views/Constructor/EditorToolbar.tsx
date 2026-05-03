import { Button, Divider, Select, Space } from "antd";
import {
  AlignCenterOutlined,
  BgColorsOutlined,
  BoldOutlined,
  BorderOutlined,
  ExportOutlined,
  FontColorsOutlined,
  ImportOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";

const fontOptions = [
  { value: "Inter", label: "Inter" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
];

const sizeOptions = [
  { value: 10, label: "10" },
  { value: 12, label: "12" },
  { value: 14, label: "14" },
  { value: 16, label: "16" },
  { value: 18, label: "18" },
  { value: 24, label: "24" },
];

interface EditorToolbarProps {
  diagramName: string;
  onDiagramNameChange: (name: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
}

export function EditorToolbar({
  diagramName,
  onDiagramNameChange,
  onSave,
  onDiscard,
  saving = false,
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
          style={{ width: 140 }}
          options={fontOptions}
        />

        <Select defaultValue={14} style={{ width: 70 }} options={sizeOptions} />

        <Button icon={<BoldOutlined />} />
        <Button icon={<ItalicOutlined />} />
        <Button icon={<UnderlineOutlined />} />
        <Button icon={<FontColorsOutlined />} />
        <Button icon={<AlignCenterOutlined />} />

        <Divider type="vertical" />

        <Button icon={<BgColorsOutlined />} />
        <Button icon={<BorderOutlined />} />

        <Divider type="vertical" />

        <Button icon={<LinkOutlined />} />
        
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

        <Button>
          <ImportOutlined /> Importar
        </Button>
        <Button>
          <ExportOutlined /> Exportar{" "}
        </Button>
        <Button onClick={onDiscard}>Descartar alterações</Button>
        <Button type="primary" onClick={onSave} loading={saving}>
          Salvar
        </Button>
      </Space>
    </div>
  );
}
