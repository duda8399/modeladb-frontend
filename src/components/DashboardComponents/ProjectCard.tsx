import { Card, theme, Typography } from "antd";

const { Text } = Typography;

interface ProjectCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function ProjectCard({
  title,
  description,
  icon,
  onClick,
}: ProjectCardProps) {
    const {
    token: { colorPrimary },
  } = theme.useToken();

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        width: 350,
        borderRadius: 12,
        background: '#F5F5F3'
      }}
    >
      <div style={{ fontSize: 28, color: colorPrimary }}>{icon}</div>

      <div style={{ marginTop: 16, fontWeight: 600, color: colorPrimary }}>{title}</div>

      <Text type="secondary">{description}</Text>
    </Card>
  );
}
