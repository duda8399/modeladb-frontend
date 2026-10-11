import { Button, Modal, message } from "antd";
import { ImportOutlined } from "@ant-design/icons";
import { useState } from "react";

import type { Dispatch, SetStateAction } from "react";

import type { CustomEdge, CustomNode } from "../../types/diagramER";
import { parseSqlToDiagram, SqlImportError } from "../../utils/sqlImport";

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
  const [messageApi, messageContextHolder] = message.useMessage();
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

    const isSql = file.name.toLowerCase().endsWith(".sql");

    reader.onload = (readerEvent) => {
      const content = readerEvent.target?.result as string;

      if (isSql) {
        importSql(content);
        return;
      }

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
        messageApi.success("Diagrama importado com sucesso");
      } catch {
        messageApi.error("Arquivo inválido. Selecione um JSON de diagrama válido.");
        setNodes(oldNodes);
        setEdges(oldEdges);
        onDiagramNameChange(oldName);
      } finally {
        setImporting(false);
      }
    };

    reader.onerror = () => {
      messageApi.error("Não foi possível ler o arquivo.");
      setImporting(false);
    };

    reader.readAsText(file);
  };

  const importSql = (content: string) => {
    try {
      const {
        nodes: importedNodes,
        edges: importedEdges,
        warnings,
        tableCount,
        relationCount,
        viewCount,
        indexCount,
      } = parseSqlToDiagram(content);

      onBeforeImportReplace();
      setNodes(importedNodes);
      setEdges(importedEdges);

      const count = (value: number, singular: string, plural: string) =>
        `${value} ${value === 1 ? singular : plural}`;
      const parts = [
        count(tableCount, "tabela", "tabelas"),
        count(relationCount, "relacionamento", "relacionamentos"),
        ...(indexCount ? [count(indexCount, "índice", "índices")] : []),
        ...(viewCount ? [count(viewCount, "view", "views")] : []),
      ];
      const summary =
        parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
      messageApi.success(`SQL importado: ${summary}`);

      if (warnings.length) {
        modal.warning({
          title: "Alguns trechos do SQL não foram convertidos",
          width: 560,
          content: (
            <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 300, overflowY: "auto" }}>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ),
        });
      }
    } catch (error) {
      messageApi.error(
        error instanceof SqlImportError
          ? error.message
          : "Não foi possível interpretar o arquivo SQL.",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleImportClick = () => {
    modal.confirm({
      title: "Importar diagrama",
      content:
        "Selecione um diagrama (.json) ou um script SQL com CREATE TABLE (.sql, MySQL ou PostgreSQL). O diagrama atual será substituído. Deseja continuar?",
      okText: "Continuar",
      cancelText: "Cancelar",
      onOk: () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json,.sql";
        fileInput.onchange = handleFileUpload;
        fileInput.click();
      },
    });
  };

  return (
    <>
      {modalContextHolder}
      {messageContextHolder}
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