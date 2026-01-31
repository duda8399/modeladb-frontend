import React, { useState } from "react";
import {
  FolderOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { Button, Col, Layout, Menu, Row, theme } from "antd";
import { useNavigate } from "react-router-dom";
import LogoFull from "../../assets/logo.png";
import LogoIcon from "../../assets/icon.png";
import Title from "antd/es/typography/Title";
import { ProjectCard } from "../../components/DashboardComponents/ProjectCard";

const { Header, Sider, Content } = Layout;

const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorPrimary },
  } = theme.useToken();

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

        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={["1"]}
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
      <Layout style={{ minHeight: "98vh" }}>
        <Header
          style={{
            padding: 0,
            background: colorPrimary,
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
        </Header>
        <Content
          style={{
            margin: "24px 16px",
            padding: "5px 20px",
            background: "#fff",
            borderRadius: 2,
          }}
        >
          <Title level={4}>Criar novo projeto</Title>

          <Row gutter={[16, 16]}>
            <Col>
              <ProjectCard
                title="Novo Projeto"
                description="Criar modelagem do zero"
                onClick={() => navigate("/model")}
              />
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainPage;
