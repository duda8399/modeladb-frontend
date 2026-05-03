import { ApartmentOutlined, DeleteOutlined, ShareAltOutlined } from "@ant-design/icons";
import { Button, Card, Popconfirm, message, theme, Typography } from "antd";
import { useNavigate } from "react-router-dom";

const { Text } = Typography;

interface DocumentCardData {
  id: string;
  name: string;
  updatedAt: string;
}

interface ProjectCardProps {
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
}: ProjectCardProps) {
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

  const formattedUpdatedAt = new Date(document.updatedAt).toLocaleString("pt-BR");

  return (
    <Card
      hoverable
      onClick={handleClick}
      style={{
        width: 350,
        borderRadius: 12,
        background: "#F5F5F3",
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            zIndex: 1,
          }}
        >
          <Button type="text" icon={<ShareAltOutlined />} onClick={handleShare} />

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
              loading={isDeleting}
              disabled={isDeleting}
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 72 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#E8EDEB",
              fontSize: 24,
              color: colorPrimary,
              flexShrink: 0,
            }}
          >
            <ApartmentOutlined />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, color: colorPrimary }}>{document.name}</div>
            <Text type="secondary">Atualizado em {formattedUpdatedAt}</Text>
          </div>
        </div>
      </div>
    </Card>
  );
}
