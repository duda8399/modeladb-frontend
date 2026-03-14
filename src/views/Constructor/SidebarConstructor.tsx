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
};

export function SidebarConstructor() {
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
              backgroundColor: "#1677ff",
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
          <AppstoreOutlined style={{ color: "#52c41a", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>Padrão</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          <Button icon={<FontSizeOutlined />} />
          <Button icon={<BorderOutlined />} />
          <Button icon={<FileOutlined />} />
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

      <div style={nodeStyle}>Input Node</div>
      <div style={nodeStyle}>Default Node</div>
      <div style={nodeStyle}>Output Node</div>
    </aside>
  );
}
