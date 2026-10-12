import {
  Layout,
  type MenuProps,
  Button,
  Dropdown,
  theme,
  Avatar,
  Menu,
} from "antd";
import {
  LogoutOutlined,
  UserOutlined,
  HomeOutlined,
  FolderOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { InvitationsBell } from "./InvitationsBell";
import { useNavigate } from "react-router-dom";
import LogoFull from "../../assets/logo2.png";
import { logout } from "../../services/auth.service";

const { Header } = Layout;

const profileMenuItems: MenuProps["items"] = [
  {
    key: "profile",
    icon: <UserOutlined />,
    label: "Meu perfil",
  },
  { type: "divider" },
  {
    key: "logout",
    icon: <LogoutOutlined />,
    label: "Sair",
    danger: true,
  },
];

export function Navbar() {
  const navigate = useNavigate();
  const avatarUrl = localStorage.getItem("avatar") || undefined;

  const {
    token: { colorPrimary },
  } = theme.useToken();

  const routes: Record<string, string> = {
    home: "/",
    documents: "/documents",
    shared: "/shared",
  };

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      void logout();
      navigate("/login");
    }

    if (key === "profile") {
      navigate("/profile");
    }
  };

  return (
    <Header
      style={{
        padding: "0 24px",
        background: colorPrimary,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40,
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          onClick={() => navigate("/")}
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <img
            src={LogoFull}
            style={{
              marginTop: 10,
              width: 200,
              height: 180,
              objectFit: "cover",
            }}
            alt="Logo"
          />
        </div>

        <Menu
          className="header-menu"
          mode="horizontal"
          selectable
          defaultSelectedKeys={["home"]}
          style={{
            background: "transparent",
            borderBottom: "none",
            flex: 1,
            minWidth: 0,
          }}
          onClick={({ key }) => navigate(routes[key])}
          items={[
            {
              key: "home",
              icon: <HomeOutlined />,
              label: "Início",
            },
            {
              key: "documents",
              icon: <FolderOutlined />,
              label: "Meus documentos",
            },
            {
              key: "shared",
              icon: <ShareAltOutlined />,
              label: "Compartilhados comigo",
            },
          ]}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <InvitationsBell />
        <Dropdown
          menu={{ items: profileMenuItems, onClick: handleMenuClick }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Button type="text" style={{ color: "#fff", flexShrink: 0 }}>
            <Avatar size={36} src={avatarUrl} icon={<UserOutlined />} />
          </Button>
        </Dropdown>
      </div>
    </Header>
  );
}
