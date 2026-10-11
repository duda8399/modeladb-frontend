import { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, Input, Popconfirm, Space, Spin, Tag, Tooltip, Typography, message } from "antd";
import { DeleteOutlined, EyeOutlined, HistoryOutlined, RollbackOutlined, SaveOutlined } from "@ant-design/icons";
import { versionsService, type VersionKind, type VersionSummary } from "../../services/versionsService";
import { formatVersionDate, versionTitle } from "../../utils/versionLabels";
import type { DiagramSnapshot } from "../../utils/diagramDiff";
import VersionPreviewModal from "./VersionPreviewModal";

const { Text } = Typography;

const KIND_INFO: Record<VersionKind, { color: string; label: string }> = {
  MANUAL: { color: "green", label: "Manual" },
  AUTO: { color: "default", label: "Automática" },
  RESTORE: { color: "orange", label: "Backup" },
};

const plural = (count: number, singular: string, pluralText: string) =>
  `${count} ${count === 1 ? singular : pluralText}`;

interface Props {
  open: boolean;
  onClose: () => void;
  diagramId: string;
  canEdit: boolean;
  isOwner: boolean;
  current: DiagramSnapshot;
  onBeforeSnapshot: () => Promise<void>;
  onRestore: (versionId: string) => Promise<void>;
}

function HistoryPanel({ diagramId, canEdit, isOwner, current, onBeforeSnapshot, onRestore }: Omit<Props, "open" | "onClose">) {
  const [messageApi, contextHolder] = message.useMessage();
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<VersionSummary | null>(null);

  const reload = useCallback(
    () =>
      versionsService
        .list(diagramId)
        .then(setVersions)
        .catch(() => {
          setVersions([]);
          messageApi.error("Não foi possível carregar o histórico.");
        }),
    [diagramId, messageApi],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const saveVersion = async () => {
    setSaving(true);
    try {
      await onBeforeSnapshot();
      await versionsService.create(diagramId, label);
      setLabel("");
      messageApi.success("Versão salva no histórico.");
      await reload();
    } catch {
      messageApi.error("Não foi possível salvar a versão.");
    } finally {
      setSaving(false);
    }
  };

  const rename = async (version: VersionSummary, value: string) => {
    if (value.trim() === (version.label ?? "")) return;
    try {
      await versionsService.rename(diagramId, version.id, value);
      await reload();
    } catch {
      messageApi.error("Não foi possível renomear a versão.");
    }
  };

  const remove = async (version: VersionSummary) => {
    try {
      await versionsService.remove(diagramId, version.id);
      await reload();
    } catch {
      messageApi.error("Não foi possível excluir a versão.");
    }
  };

  const restore = async (versionId: string) => {
    await onRestore(versionId);
    await reload();
  };

  return (
    <>
      {contextHolder}

      {canEdit && (
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            aria-label="Nome da versão"
            placeholder="Nome da versão (opcional)"
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
            onPressEnter={saveVersion}
          />
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveVersion}>
            Salvar versão
          </Button>
        </Space.Compact>
      )}

      <Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 12 }}>
        Uma versão automática é guardada a cada 10 minutos de edição. Antes de cada restauração, o estado atual
        vira um backup.
      </Text>

      {versions === null ? (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin />
        </div>
      ) : versions.length === 0 ? (
        <Empty description="Nenhuma versão ainda. Elas aparecem conforme o diagrama é salvo." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {versions.map((version) => (
            <li
              key={version.id}
              data-testid="version-item"
              style={{ padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Tag color={KIND_INFO[version.kind].color}>{KIND_INFO[version.kind].label}</Tag>
                <Text
                  strong
                  style={{ flex: 1, minWidth: 0 }}
                  ellipsis={{ tooltip: true }}
                  editable={
                    canEdit
                      ? {
                          text: version.label ?? "",
                          tooltip: "Renomear",
                          maxLength: 120,
                          onChange: (value) => rename(version, value),
                        }
                      : false
                  }
                >
                  {versionTitle(version, versions)}
                </Text>
              </div>
              <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                {formatVersionDate(version.createdAt)}
                {version.createdByName ? ` · ${version.createdByName}` : ""}
              </Text>
              <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                {[
                  plural(version.tableCount, "tabela", "tabelas"),
                  version.viewCount ? plural(version.viewCount, "view", "views") : null,
                  plural(version.relationCount, "relacionamento", "relacionamentos"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Space size={4} style={{ marginTop: 6 }}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setPreview(version)}>
                  Visualizar
                </Button>
                {canEdit && (
                  <Popconfirm
                    title="Restaurar esta versão?"
                    description="O diagrama atual é guardado no histórico antes da restauração."
                    okText="Restaurar"
                    cancelText="Cancelar"
                    onConfirm={() => restore(version.id)}
                  >
                    <Button size="small" icon={<RollbackOutlined />}>
                      Restaurar
                    </Button>
                  </Popconfirm>
                )}
                {isOwner && (
                  <Popconfirm
                    title="Excluir esta versão do histórico?"
                    okText="Excluir"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancelar"
                    onConfirm={() => remove(version)}
                  >
                    <Tooltip title="Excluir versão">
                      <Button size="small" danger icon={<DeleteOutlined />} aria-label="Excluir versão" />
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            </li>
          ))}
        </ul>
      )}

      {preview && versions && (
        <VersionPreviewModal
          key={preview.id}
          diagramId={diagramId}
          versionId={preview.id}
          title={`${versionTitle(preview, versions)} · ${formatVersionDate(preview.createdAt)}`}
          current={current}
          canRestore={canEdit}
          onRestore={restore}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export default function VersionHistoryDrawer({ open, onClose, ...panel }: Props) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={420}
      destroyOnHidden
      title={
        <Space>
          <HistoryOutlined />
          Histórico de versões
        </Space>
      }
    >
      {open && <HistoryPanel {...panel} />}
    </Drawer>
  );
}
