import { Layout, type MenuProps, Button, Dropdown, theme } from "antd";
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";

const { Header } = Layout;

type HeaderBarProps = {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

const profileMenuItems: MenuProps["items"] = [
  {
    key: "profile",
    icon: <UserOutlined />,
    label: "Meu perfil",
  },
  {
    key: "settings",
    icon: <SettingOutlined />,
    label: "Configurações",
  },
  {
    type: "divider",
  },
  {
    key: "logout",
    icon: <LogoutOutlined />,
    label: "Sair",
    danger: true,
  },
];

export function HeaderBar({ collapsed, setCollapsed }: HeaderBarProps) {
  const {
    token: { colorPrimary },
  } = theme.useToken();

  return (
    <Header
      style={{
        padding: "0 16px",
        background: colorPrimary,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={() => setCollapsed((prev) => !prev)}
        style={{
          fontSize: 16,
          width: 64,
          height: 64,
          color: "#fff",
        }}
      />

      <Dropdown
        menu={{ items: profileMenuItems }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <Button
          type="text"
          icon={<UserOutlined />}
          style={{ color: "#fff", fontSize: 18 }}
        />
      </Dropdown>
    </Header>
  );
}
