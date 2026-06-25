import { KeyOutlined } from "@ant-design/icons";

// Icone de chave para Primary Key (padrao MySQL Workbench)
export const PkIcon = () => (
  <KeyOutlined style={{ color: "#faad14", flexShrink: 0 }} />
);

// Losango azul para Foreign Key
export const FkIcon = ({ size = 11 }: { size?: number }) => (
  <span
    style={{
      display: "inline-block",
      width: size,
      height: size,
      background: "#1677ff",
      transform: "rotate(45deg)",
      borderRadius: 2,
      flexShrink: 0,
    }}
  />
);
