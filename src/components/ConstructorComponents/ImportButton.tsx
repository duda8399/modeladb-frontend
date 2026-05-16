import { Button, Modal, message } from "antd";
import { ImportOutlined } from "@ant-design/icons";
import { useState } from "react";

import type { Dispatch, SetStateAction } from "react";

import type { CustomEdge, CustomNode } from "../../types/diagramER";

interface ImportButtonProps {
  diagramName: string;
  onDiagramNameChange: (name: string) => void;
  nodes: CustomNode[];
  edges: CustomEdge[];
  setNodes: Dispatch<SetStateAction<CustomNode[]>>;
  setEdges: Dispatch<SetStateAction<CustomEdge[]>>;
  onBeforeImportReplace: () => void;
}

export function ImportButton({
  diagramName,
  onDiagramNameChange,
  nodes,
  edges,
  setNodes,
  setEdges,
  onBeforeImportReplace,
}: ImportButtonProps) {
  const [modal, modalContextHolder] = Modal.useModal();
  const [importing, setImporting] = useState(false);

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

        onBeforeImportReplace();
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
      <Button
        title="Importar"
        icon={<ImportOutlined />}
        onClick={handleImportClick}
        loading={importing}
      >
        Importar
      </Button>
    </>
  );
}