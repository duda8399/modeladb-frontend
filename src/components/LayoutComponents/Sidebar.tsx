import { Layout, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import LogoFull from "../../assets/logo.png";
import LogoIcon from "../../assets/icon.png";
import {
  FolderOutlined,
  HomeOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";

const { Sider } = Layout;

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  const routes: Record<string, string> = {
    "1": "/",
    "2": "/documents",
    "3": "/shared",
  };

  const selectedKey =
    Object.entries(routes).find(([, path]) =>
      path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)
    )?.[0] ?? "1";

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={260}
      collapsedWidth={90}
    >
      <div
        onClick={() => navigate("/")}
        style={{
          height: 85,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderBottom: "1px solid #8c8c8c",
        }}
      >
        <img
          src={collapsed ? LogoIcon : LogoFull}
          style={{
            width: collapsed ? 60 : 200,
            height: collapsed ? 60 : 80,
            objectFit: "cover",
          }}
          alt="Logo"
        />
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        onClick={({ key }) => navigate(routes[key])}
        items={[
          {
            key: "1",
            icon: <HomeOutlined />,
            label: "Início",
            title: "Início",
          },
          {
            key: "2",
            icon: <FolderOutlined />,
            label: "Meus documentos",
            title: "Meus documentos",
          },
          {
            key: "3",
            icon: <ShareAltOutlined />,
            label: "Compartilhados comigo",
            title: "Compartilhados comigo",
          },
        ]}
      />
    </Sider>
  );
}
