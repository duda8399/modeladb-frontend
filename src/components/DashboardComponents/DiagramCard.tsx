import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { Button, Card, Popconfirm, message, theme, Typography } from "antd";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

interface DocumentCardData {
  id: string;
  name: string;
  updatedAt: string;
}

interface DiagramCardProps {
  document: DocumentCardData;
  onClick?: () => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

export function DiagramCard({
  document,
  onClick,
  onDelete,
  isDeleting = false,
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
        await navigator.share({
          title: document.name,
          text: `Confira o modelo ${document.name}`,
          url,
        });
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
      style={{ width: "100%", borderRadius: 12, background: "#F5F5F3" }}
      extra={
        <div
          style={{ display: "flex", gap: 2 }}
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
      }
      styles={{
        header: { borderBottom: "none", paddingBottom: 0, paddingTop: 4,minHeight: "auto" },
        body: { padding: "0px 24px 16px" },
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#E8EDEB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: colorPrimary,
          }}
        >
          <ApartmentOutlined />
        </div>

        <div>
          <span style={{ color: colorPrimary, fontSize: 14, fontWeight: 600 }}>
            {document.name}
          </span>
          <Text
            type="secondary"
            style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Atualizado em {formattedUpdatedAt}
          </Text>
        </div>
      </div>
    </Card>
  );
}
