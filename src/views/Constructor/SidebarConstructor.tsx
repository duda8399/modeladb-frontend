import { Input, Button } from "antd";
import {
  AppstoreOutlined,
  BorderOutlined,
  DatabaseOutlined,
  FileOutlined,
  FontSizeOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const nodeStyle = {
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  cursor: "grab",
  fontSize: 13,
  marginBottom: 8,
  transition: "all 0.2s",
  fontWeight: "normal",
  textAlign: "center" as const,
};

interface Props {
  onAddEntity: () => void;
}

export function SidebarConstructor({ onAddEntity }: Props) {
  return (
    <aside
      style={{
        background: "#fafafa",
        minHeight: "100%",
        width: 260,
        borderRight: "1px solid #e5e7eb",
        padding: 12,
        fontSize: 13,
      }}
    >
      <div
        style={{
          paddingTop: 20,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 10,
          }}
        >
          <RobotOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>IA do ModelaDB</span>
        </div>

        <Input.TextArea
          placeholder="Descreva seu banco de dados..."
          autoSize={{ minRows: 3, maxRows: 5 }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 10,
          }}
        >
          <Button
            style={{
              backgroundColor: "#2F7D32",
              color: "#fff",
            }}
            icon={<ThunderboltOutlined />}
          >
            Gerar
          </Button>
        </div>
      </div>

      <div
        style={{
          paddingTop: 20,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 10,
          }}
        >
          <AppstoreOutlined style={{ color: "#2F7D32", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>Padrão</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
          }}
        >
          <Button
            block
            style={{ height: 60 }}
            icon={<FontSizeOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            style={{ height: 60 }}
            icon={<BorderOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            style={{ height: 60 }}
            icon={<FileOutlined style={{ fontSize: 20 }} />}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 20,
          paddingBottom: 10,
        }}
      >
        <DatabaseOutlined style={{ color: "#fa8c16", fontSize: 16 }} />
        <span style={{ fontWeight: "bold" }}>ER</span>
      </div>

      <div style={nodeStyle} onClick={onAddEntity}>
        Adicionar Entidade
      </div>
    </aside>
  );
}
