import { LogOut } from "lucide-react";
import {
  ApartmentOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ShareAltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
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
}: DiagramCardProps) {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const handleClick = () => {
    navigate(`/model/${document.id}`);
    onClick?.();
  };

  // Atalho para a mesma janela de compartilhamento do editor (convidar
  // colaboradores e gerenciar papeis), sem precisar abrir o diagrama.
  const handleShare = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setShareOpen(true);
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
              <>
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
                <Tooltip title="Compartilhar">
                  <Button
                    type="text"
                    size="small"
                    aria-label="Compartilhar"
                    icon={<ShareAltOutlined />}
                    onClick={handleShare}
                  />
                </Tooltip>
              </>
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
