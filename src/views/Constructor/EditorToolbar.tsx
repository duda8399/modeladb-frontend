import { Button, Divider, Modal, Select, Space, message } from "antd";
import {
  AlignCenterOutlined,
  BgColorsOutlined,
  BoldOutlined,
  ExportOutlined,
  FontColorsOutlined,
  ImportOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { SlActionRedo, SlActionUndo } from "react-icons/sl";
import type { Dispatch, SetStateAction } from "react";
import type { CustomEdge, CustomNode } from "../../types/diagramER";

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
  nodes: CustomNode[];
  edges: CustomEdge[];
  setNodes: Dispatch<SetStateAction<CustomNode[]>>;
  setEdges: Dispatch<SetStateAction<CustomEdge[]>>;
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
}: EditorToolbarProps) {
  const [modal, modalContextHolder] = Modal.useModal();
  const [importing, setImporting] = useState(false);

  const handleExportClick = () => {
    const dataToDownload = {
      diagramName,
      nodes,
      edges,
    };

    const json = JSON.stringify(dataToDownload, null, 2);
    const jsonBlob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(jsonBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${diagramName || "diagrama"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    setImporting(true);

    const reader = new FileReader();
    const oldNodes = nodes;
    const oldEdges = edges;
    const oldName = diagramName;

    reader.onload = (readerEvent) => {
      const content = readerEvent.target?.result as string;

      try {
        const parsed = JSON.parse(content);
        const importedNodes = Array.isArray(parsed.nodes) ? parsed.nodes : null;
        const importedEdges = Array.isArray(parsed.edges) ? parsed.edges : null;

        if (!importedNodes || !importedEdges) {
          throw new Error("Arquivo inválido");
        }

        onDiagramNameChange(parsed.diagramName || parsed.name || "");
        setNodes(importedNodes);
        setEdges(importedEdges);
        message.success("Diagrama importado com sucesso");
      } catch {
        message.error("Arquivo inválido. Selecione um JSON de diagrama válido.");
        setNodes(oldNodes);
        setEdges(oldEdges);
        onDiagramNameChange(oldName);
      } finally {
        setImporting(false);
      }
    };

    reader.readAsText(file);
  };

  const handleImportClick = () => {
    modal.confirm({
      title: "Importar diagrama",
      content:
        "Ao importar um arquivo, o diagrama atual será substituído. Deseja continuar?",
      okText: "Continuar",
      cancelText: "Cancelar",
      onOk: () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.onchange = handleFileUpload;
        fileInput.click();
      },
    });
  };

  return (
    <>
      {modalContextHolder}
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
          <Button title="Adicionar cor de fundo" icon={<BgColorsOutlined />} />

          <Divider type="vertical" />

          <Button title="Compartilhar diagrama" icon={<LinkOutlined />} />
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
          <Button
            title="Importar"
            icon={<ImportOutlined />}
            onClick={handleImportClick}
            loading={importing}
          />
          <Button title="Exportar" icon={<ExportOutlined />} onClick={handleExportClick} />
        </Space>
      </div>
    </>
  );
}
