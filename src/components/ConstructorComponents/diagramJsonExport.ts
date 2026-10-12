import type { CustomEdge, CustomNode } from "../../types/diagramER";

export function downloadDiagramJson(diagramName: string, nodes: CustomNode[], edges: CustomEdge[]) {
  const json = JSON.stringify({ diagramName, nodes, edges }, null, 2);
  const jsonBlob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(jsonBlob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${diagramName || "diagrama"}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
