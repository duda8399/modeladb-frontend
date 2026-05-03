import { Button, Divider, Select, Space } from "antd";
import {
  AlignCenterOutlined,
  BoldOutlined,
  ExportOutlined,
  FontColorsOutlined,
  ImportOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { SlActionRedo, SlActionUndo } from "react-icons/sl";

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
  saving?: boolean;
}

export function EditorToolbar({
  diagramName,
  onDiagramNameChange,
  onSave,
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

        <Button title="Negrito" icon={<BoldOutlined />} />
        <Button title="Itálico" icon={<ItalicOutlined />} />
        <Button title="Sublinhado" icon={<UnderlineOutlined />} />
        <Button title="Cor da Fonte" icon={<FontColorsOutlined />} />
        <Button title="Alinhar ao Centro" icon={<AlignCenterOutlined />} />

        <Divider type="vertical" />

        <Button title="Compartilhar diagrama" icon={<LinkOutlined />} />

        <Divider type="vertical" />

        <Button title="Desfazer" icon={<SlActionUndo />} />
        <Button title="Refazer" icon={<SlActionRedo />} />
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
        <Button title="Importar" icon={<ImportOutlined />} />
        <Button title="Exportar" icon={<ExportOutlined />} />
      </Space>
    </div>
  );
}
