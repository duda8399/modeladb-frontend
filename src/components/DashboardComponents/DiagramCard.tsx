import {
  ApartmentOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ShareAltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Card, Popconfirm, Tag, message, theme, Typography } from "antd";
import { useNavigate } from "react-router-dom";

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
}

export function DiagramCard({
  document,
  onClick,
  onDelete,
  isDeleting = false,
  roleLabel,
  ownerName,
}: DiagramCardProps) {
  const navigate = useNavigate();
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const handleClick = () => {
    navigate(`/model/${document.id}`);
    onClick?.();
  };

  const handleShare = async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const url = `${window.location.origin}/model/${document.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      message.success("Link do modelo copiado com sucesso.");
    } catch {
      message.error("Não foi possível compartilhar este modelo.");
    }
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
          style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
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
          <Button
            type="text"
            size="small"
            icon={<ShareAltOutlined />}
            onClick={handleShare}
          />
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
  );
}
