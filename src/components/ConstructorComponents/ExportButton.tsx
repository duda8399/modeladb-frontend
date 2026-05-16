import { Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";

import type { CustomEdge, CustomNode } from "../../types/diagramER";

interface ExportButtonProps {
  diagramName: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
}

export function ExportButton({
  diagramName,
  nodes,
  edges,
}: ExportButtonProps) {
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

  return (
    <Button title="Exportar" icon={<ExportOutlined />} onClick={handleExportClick}>
      Exportar
    </Button>
  );
}