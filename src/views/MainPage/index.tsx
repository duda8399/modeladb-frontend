import React, { useEffect, useState } from "react";
import { Col, message, Row, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { ProjectCard } from "../../components/DashboardComponents/ProjectCard";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { DatabaseOutlined, RobotOutlined } from "@ant-design/icons";
import { api } from "../../services/api";
import CreateDiagramModal from "../../components/DashboardComponents/CreateDiagramModal";
import GenerateDiagramModal from "../../components/DashboardComponents/GenerateDiagramModal";

const { Title, Text } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem("userId") || undefined;
  const [messageApi, contextHolder] = message.useMessage();
  const [isCreateDiagramModalOpen, setIsCreateDiagramModalOpen] =
    useState(false);
  const [isGenerateDiagramModalOpen, setIsGenerateDiagramModalOpen] =
    useState(false);
  const [recent, setRecent] = useState<Project[]>([]);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const { data } = await api.get("/diagram/recent");
      setRecent(data);
    } catch (e) {
      console.log(e);
    }
  }

  const handleCreate = async (name: string) => {
    navigate(`/model/1234`);

    try {
      const { data } = await api.post("/diagram/create", { name, userId });

      if (data?.id) {
        navigate(`/model/${data.id}`);
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;

      const messageText = !errorMessage
        ? "Ocorreu um erro ao criar o diagrama"
        : errorMessage;

      messageApi.error(messageText);
    }
  };

  const handleGenerate = async (prompt: string) => {
    console.log('prompt', prompt);
  }

  return (
    <AppLayout>
      {contextHolder}
      <Title level={3}>O que você deseja criar?</Title>
      <Text type="secondary">
        Comece um novo projeto ou gere sua modelagem com ajuda da IA
      </Text>

      <CreateDiagramModal
        open={isCreateDiagramModalOpen}
        onClose={() => setIsCreateDiagramModalOpen(false)}
        onCreate={handleCreate}
      />

      <GenerateDiagramModal
        open={isGenerateDiagramModalOpen}
        onClose={() => setIsGenerateDiagramModalOpen(false)}
        onGenerate={handleGenerate}
      />

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col>
          <ProjectCard
            icon={<DatabaseOutlined />}
            title="Diagrama ER"
            description="Criar modelagem do zero"
            onClick={() => setIsCreateDiagramModalOpen(true)}
          />
        </Col>

        <Col>
          <ProjectCard
            icon={<RobotOutlined />}
            title="Gerar com IA"
            description="Descreva seu banco e deixe a IA montar"
            onClick={() => setIsGenerateDiagramModalOpen(true)}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 48 }}>
        <Title level={4}>Documentos recentes</Title>

        <Row gutter={[16, 16]}>
          {recent.map((project) => (
            <Col key={project.id}>
              <ProjectCard
                title={project.name}
                description={`Editado em ${new Date(
                  project.updatedAt,
                ).toLocaleDateString()}`}
                onClick={() => navigate(`/model/${project.id}`)}
              />
            </Col>
          ))}
        </Row>
      </div>
    </AppLayout>
  );
};

export default MainPage;
