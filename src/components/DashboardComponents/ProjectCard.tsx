import React from "react";
import { Card, theme, Typography } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface ProjectCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function ProjectCard({ title, description, icon, onClick }: ProjectCardProps) {
  const {
    token: { colorPrimary },
  } = theme.useToken();

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        width: "100%",
        height: "140px",
        borderRadius: 12,
        background: "#F5F5F3",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
      styles={{
        body: {
          padding: "20px 24px",
          height: "100%",
          display: "flex",
          alignItems: "center",
        },
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          height: "100%",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#E8EDEB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: colorPrimary,
          }}
        >
          {icon ?? <DatabaseOutlined />}
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: colorPrimary }}>
            {title}
          </div>
          {description && (
            <Text
              type="secondary"
              style={{ fontSize: 12, marginTop: 2, whiteSpace: "nowrap" }}
            >
              {description}
            </Text>
          )}
        </div>
      </div>
    </Card>
  );
}
