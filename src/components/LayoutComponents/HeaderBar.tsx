import { Layout, type MenuProps, Button, Dropdown, theme, Avatar } from "antd";
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const avatarUrl = localStorage.getItem("avatar") || undefined;
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      localStorage.removeItem("userId");
      localStorage.removeItem("accessToken");
      navigate("/login");
    }

    if (key === "profile") {
      navigate("/profile");
    }
  };

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
        menu={{ items: profileMenuItems, onClick: handleMenuClick }}
        trigger={["click"]}
        placement="bottomRight"
        overlayStyle={{ width: 200 }}
      >
        <Button type="text" style={{ color: "#fff" }}>
          <Avatar
            size={36}
            src={avatarUrl}
            icon={!avatarUrl && <UserOutlined />}
          />
        </Button>
      </Dropdown>
    </Header>
  );
}
