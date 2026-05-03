import { ApartmentOutlined } from "@ant-design/icons";
import { Card, theme, Typography } from "antd";
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
}

export function DiagramCard({
  document,
  onClick,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const handleClick = () => {
    navigate(`/model/${document.id}`);
    onClick?.();
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
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: colorPrimary }}>{document.name}</div>
          <Text type="secondary">Atualizado em {formattedUpdatedAt}</Text>
        </div>
      </div>
    </Card>
  );
}
