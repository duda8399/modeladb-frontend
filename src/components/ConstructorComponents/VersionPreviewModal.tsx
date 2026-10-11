import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Modal, Popconfirm, Spin, Tag, Typography } from "antd";
import { ReactFlow, ReactFlowProvider, Background, Controls, type EdgeTypes, type NodeTypes } from "reactflow";
import EntityNode from "./EntityNode";
import ViewNode from "./ViewNode";
import NoteNode from "./NoteNode";
import SectionNode from "./SectionNode";
import TextNode from "./TextNode";
import FloatingEdge from "./FloatingEdge";
import ViewEdge from "./ViewEdge";
import { versionsService, type VersionDetail } from "../../services/versionsService";
import { diffDiagrams, type ChangeKind, type DiagramSnapshot } from "../../utils/diagramDiff";
import { buildViewEdges, viewSources } from "../../utils/viewEdges";
import type { CustomEdge, CustomNode } from "../../types/diagramER";

const { Text } = Typography;

const nodeTypes = {
  entityNode: EntityNode,
  viewNode: ViewNode,
  noteNode: NoteNode,
  sectionNode: SectionNode,
  textNode: TextNode,
} as unknown as NodeTypes;

const edgeTypes = { floating: FloatingEdge, viewEdge: ViewEdge } as unknown as EdgeTypes;

const KIND_TAG: Record<ChangeKind, { color: string; label: string }> = {
  added: { color: "green", label: "criado" },
  removed: { color: "red", label: "removido" },
  changed: { color: "blue", label: "alterado" },
};

interface Props {
  diagramId: string;
  versionId: string;
  title: string;
  current: DiagramSnapshot;
  canRestore: boolean;
  onRestore: (versionId: string) => Promise<void>;
  onClose: () => void;
}

export default function VersionPreviewModal({
  diagramId,
  versionId,
  title,
  current,
  canRestore,
  onRestore,
  onClose,
}: Props) {
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let active = true;
    versionsService
      .get(diagramId, versionId)
      .then((data) => active && setVersion(data))
      .catch((err) => active && setError(err?.response?.data?.message ?? "Não foi possível carregar a versão."));
    return () => {
      active = false;
    };
  }, [diagramId, versionId]);

  const previewNodes = useMemo<CustomNode[]>(
    () =>
      (version?.nodes ?? []).map((node) => ({
        ...node,
        draggable: false,
        selectable: false,
        connectable: false,
        style: { ...(node.style ?? {}), pointerEvents: "none" },
      })),
    [version],
  );

  const previewEdges = useMemo<CustomEdge[]>(() => {
    if (!version) return [];
    const relations = version.edges.map((edge) => ({ ...edge, type: "floating", selectable: false }));
    return [...relations, ...buildViewEdges(viewSources(version.nodes))];
  }, [version]);

  const changes = useMemo(
    () => (version ? diffDiagrams({ name: version.name, nodes: version.nodes, edges: version.edges }, current) : []),
    [version, current],
  );

  return (
    <Modal
      open
      onCancel={onClose}
      width={1180}
      title={title}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onClose}>
          Fechar
        </Button>,
        canRestore && (
          <Popconfirm
            key="restore"
            title="Restaurar esta versão?"
            description="O diagrama atual é guardado no histórico antes da restauração."
            okText="Restaurar"
            cancelText="Cancelar"
            onConfirm={async () => {
              setRestoring(true);
              try {
                await onRestore(versionId);
                onClose();
              } finally {
                setRestoring(false);
              }
            }}
          >
            <Button type="primary" loading={restoring} disabled={!version}>
              Restaurar esta versão
            </Button>
          </Popconfirm>
        ),
      ]}
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : !version ? (
        <div style={{ height: 520, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, height: 520 }}>
          <div
            data-testid="version-preview-canvas"
            style={{ flex: 1, minWidth: 0, border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}
          >
            {version.nodes.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Empty description="Diagrama vazio nesta versão" />
              </div>
            ) : (
              <ReactFlowProvider>
                <ReactFlow
                  nodes={previewNodes}
                  edges={previewEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  deleteKeyCode={null}
                  fitView
                  fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                  minZoom={0.1}
                  defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
                >
                  <Background />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </ReactFlowProvider>
            )}
          </div>

          <div data-testid="version-changes" style={{ width: 340, overflowY: "auto" }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Mudanças feitas desde esta versão
            </Text>
            {changes.length === 0 ? (
              <Text type="secondary">Esta versão é igual ao diagrama atual.</Text>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {changes.map((change, index) => (
                  <li key={index} style={{ padding: "6px 0", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}>
                    <Tag color={KIND_TAG[change.kind].color} style={{ marginRight: 6 }}>
                      {KIND_TAG[change.kind].label}
                    </Tag>
                    {change.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
