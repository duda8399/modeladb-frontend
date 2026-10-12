import { LogOut } from "lucide-react";
import {
  ApartmentOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FormOutlined,
  MoreOutlined,
  ShareAltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Dropdown,
  Input,
  Modal,
  message,
  Popconfirm,
  Tooltip,
  Tag,
  theme,
  Typography,
} from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ShareModal from "../ConstructorComponents/ShareModal";
import { getCurrentUser } from "../../utils/auth";
import { diagramsService, type DiagramSummary } from "../../services/diagramsService";

const { Text } = Typography;

interface DocumentCardData {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
}

interface DiagramCardProps {
  document: DocumentCardData;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
  roleLabel?: "Editor" | "Visualizador";
  ownerName?: string;
  // Diagrama de outra pessoa: esconde excluir e compartilhar, que sao acoes
  // so do dono.
  isShared?: boolean;
  // Sair de um diagrama compartilhado (remove o proprio acesso).
  onLeave?: (id: string) => void;
  isLeaving?: boolean;
  onRenamed?: (diagram: DiagramSummary) => void;
  onDuplicated?: (diagram: DiagramSummary) => void;
}

export function DiagramCard({
  document,
  onClick,
  onDelete,
  isDeleting = false,
  roleLabel,
  ownerName,
  isShared = false,
  onLeave,
  isLeaving = false,
  onRenamed,
  onDuplicated,
}: DiagramCardProps) {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(document.name);
  const [renaming, setRenaming] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const canRename = !isShared || roleLabel === "Editor";
  const trimmedName = renameValue.trim();

  const serverMessage = (error: unknown) =>
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const submitRename = async () => {
    if (!trimmedName || trimmedName === document.name) {
      setRenameOpen(false);
      return;
    }
    try {
      setRenaming(true);
      const renamed = await diagramsService.rename(document.id, trimmedName);
      onRenamed?.(renamed);
      setRenameOpen(false);
      messageApi.success("Diagrama renomeado.");
    } catch (error) {
      messageApi.error(serverMessage(error) || "Não foi possível renomear o diagrama.");
    } finally {
      setRenaming(false);
    }
  };

  const duplicate = async () => {
    try {
      setDuplicating(true);
      const copy = await diagramsService.duplicate(document.id);
      onDuplicated?.(copy);
      messageApi.success(
        isShared ? `"${copy.name}" foi criado em Meus documentos.` : `"${copy.name}" foi criado.`,
      );
    } catch (error) {
      messageApi.error(serverMessage(error) || "Não foi possível duplicar o diagrama.");
    } finally {
      setDuplicating(false);
    }
  };

  const moreItems = [
    { key: "duplicate", icon: <CopyOutlined />, label: "Duplicar", disabled: duplicating },
    ...(canRename ? [{ key: "rename", icon: <FormOutlined />, label: "Renomear" }] : []),
    ...(!isShared ? [{ key: "share", icon: <ShareAltOutlined />, label: "Compartilhar" }] : []),
  ];

  const handleMoreClick = ({ key, domEvent }: { key: string; domEvent: React.SyntheticEvent }) => {
    domEvent.stopPropagation();
    if (key === "rename") {
      setRenameValue(document.name);
      setRenameOpen(true);
    }
    if (key === "duplicate") void duplicate();
    if (key === "share") setShareOpen(true);
  };
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const handleClick = () => {
    navigate(`/model/${document.id}`);
    onClick?.();
  };

  const formattedUpdatedAt = new Date(document.updatedAt).toLocaleString(
    "pt-BR",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  );

  return (
    <>
      {contextHolder}
      <Card
        hoverable
        onClick={handleClick}
        style={{
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            padding: "12px 12px 8px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#FFF0E8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colorPrimary,
                fontSize: 14,
              }}
            >
              <ApartmentOutlined />
            </div>
            <Text
              strong
              ellipsis
              style={{ fontSize: 13, color: "#1a1a1a", lineHeight: "1.3" }}
              title={document.name}
            >
              {document.name}
            </Text>
            {roleLabel && (
              <Tag
                color={roleLabel === "Editor" ? "blue" : "default"}
                style={{ marginLeft: 0, flexShrink: 0 }}
              >
                {roleLabel}
              </Tag>
            )}
          </div>

          <div
            style={{ display: "flex", gap: 2, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleClick}
            />
            {!isShared && (
              <Popconfirm
                title="Excluir documento"
                description="Tem certeza que deseja excluir este documento?"
                okText="Excluir"
                cancelText="Cancelar"
                okButtonProps={{ loading: isDeleting, disabled: isDeleting }}
                cancelButtonProps={{ disabled: isDeleting }}
                disabled={isDeleting}
                onCancel={(e) => e?.stopPropagation()}
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDelete?.(document.id);
                }}
              >
                <Button
                  danger
                  type="text"
                  size="small"
                  loading={isDeleting}
                  disabled={isDeleting}
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            )}
            {isShared && onLeave && (
              <Popconfirm
                title="Sair do diagrama"
                description={
                  <>
                    Você perderá o acesso a este diagrama.
                    <br />
                    Para voltar, o proprietário precisará convidá-lo novamente.
                  </>
                }
                okText="Sair"
                cancelText="Cancelar"
                okButtonProps={{
                  danger: true,
                  loading: isLeaving,
                  disabled: isLeaving,
                }}
                cancelButtonProps={{ disabled: isLeaving }}
                disabled={isLeaving}
                onCancel={(e) => e?.stopPropagation()}
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onLeave(document.id);
                }}
              >
                <Tooltip title="Sair do diagrama">
                  <Button
                    danger
                    type="text"
                    size="small"
                    aria-label="Sair do diagrama"
                    loading={isLeaving}
                    disabled={isLeaving}
                    icon={<LogOut size={14} />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            <Dropdown menu={{ items: moreItems, onClick: handleMoreClick }} trigger={["click"]}>
              <Button
                type="text"
                size="small"
                aria-label="Mais ações"
                loading={duplicating}
                icon={<MoreOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        </div>

        <div
          style={{
            margin: "0 12px",
            height: 160,
            borderRadius: 8,
            background: "#F5F5F3",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #EBEBEB",
          }}
        >
          {document.thumbnail ? (
            <img
              src={document.thumbnail}
              alt={document.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <ApartmentOutlined style={{ fontSize: 40, color: "#D0D0D0" }} />
          )}
        </div>

        <div
          style={{
            padding: "8px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {ownerName && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <UserOutlined style={{ fontSize: 12, color: "#555" }} />
              <Text style={{ fontSize: 12, color: "#555" }}>Proprietário:</Text>
              <Text
                type="secondary"
                ellipsis
                style={{ fontSize: 11, marginLeft: "auto" }}
                title={ownerName}
              >
                {ownerName}
              </Text>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ClockCircleOutlined style={{ fontSize: 12, color: "#555" }} />
            <Text style={{ fontSize: 12, color: "#555" }}>Atualizado em:</Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
              {formattedUpdatedAt}
            </Text>
          </div>
        </div>
      </Card>

      <Modal
        title="Renomear diagrama"
        open={renameOpen}
        okText="Renomear"
        cancelText="Cancelar"
        confirmLoading={renaming}
        okButtonProps={{ disabled: !trimmedName }}
        onOk={submitRename}
        onCancel={() => setRenameOpen(false)}
        destroyOnHidden
      >
        <Input
          autoFocus
          aria-label="Novo nome"
          value={renameValue}
          maxLength={120}
          status={trimmedName ? undefined : "error"}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={submitRename}
        />
      </Modal>

      {/* Fora do Card: eventos de clique dentro do modal (portal) nao podem
        borbulhar ate o onClick do Card, que abriria o diagrama. */}
      {!isShared && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          diagramId={document.id}
          isOwner
          currentUserId={getCurrentUser()?.id ?? ""}
        />
      )}
    </>
  );
}
