import React, { useCallback, useState } from "react";
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Layout, theme, type MenuProps } from "antd";
import { useNavigate } from "react-router-dom";
import LogoFull from "../../assets/logo.png";
import LogoIcon from "../../assets/icon.png";
import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from "@xyflow/react";
import { Sidebar } from "./Sidebar";

const { Header, Sider, Content } = Layout;

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

const ConstructorPage: React.FC = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorPrimary },
  } = theme.useToken();

  const initialNodes: Node[] = [
    {
      id: "1",
      type: "input",
      data: { label: "input node" },
      position: { x: 250, y: 5 },
    },
  ];

  const [nodes, _, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [],
  );

  return (
    <Layout>
      <Sider trigger={null} collapsible collapsed={collapsed}>
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
      </Sider>
      <Layout style={{ minHeight: "98vh" }}>
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
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: "16px",
              width: 64,
              height: 64,
              color: "#fff",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <Dropdown
              menu={{ items: profileMenuItems }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Button
                type="text"
                icon={<UserOutlined />}
                style={{ color: "#fff" }}
              />
            </Dropdown>
          </div>
        </Header>

        <Content
          style={{
            margin: "24px 16px",
            padding: "5px 20px",
            background: "#fff",
            borderRadius: 2,
          }}
        >
          <div className="dndflow">
            <div className="reactflow-wrapper">
              <div
                style={{
                  display: "flex",
                  height: "100vh",
                }}
              >
                {/* Área do React Flow */}
                <div style={{ flex: 1 }}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    fitView
                  >
                    <Controls />
                    <Background />
                  </ReactFlow>
                </div>

                <div
                  style={{
                    width: 200,
                    borderLeft: "1px solid #e5e7eb",
                    background: "#f9fafb",
                  }}
                >
                  <Sidebar />
                </div>
              </div>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default ConstructorPage;
