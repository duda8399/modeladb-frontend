import React, { useEffect, useState } from "react";
import { Col, message, Row, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { ProjectCard } from "../../components/DashboardComponents/ProjectCard";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { DatabaseOutlined, RobotOutlined } from "@ant-design/icons";
import { api } from "../../services/api";
import CreateDiagramModal from "../../components/DashboardComponents/CreateDiagramModal";
import GenerateDiagramModal from "../../components/DashboardComponents/GenerateDiagramModal";
import { getToken } from "../../utils/auth";

const { Title, Text } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
}

const MainPage: React.FC = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem("userId") || undefined;
  const [messageApi, contextHolder] = message.useMessage();
  const [isCreateDiagramModalOpen, setIsCreateDiagramModalOpen] = useState(false);
  const [isGenerateDiagramModalOpen, setIsGenerateDiagramModalOpen] = useState(false);
  const [recent, setRecent] = useState<Project[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const token = getToken();
      const { data } = await api.get("/diagram/recent", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecent(data);
    } catch (e) {
      console.log(e);
    }
  }

  const handleCreate = async (name: string) => {
    try {
      const { data } = await api.post("/diagram/create", { name, userId });
      if (data?.id) {
        navigate(`/model/${data.id}`);
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;
      messageApi.error(errorMessage || "Ocorreu um erro ao criar o diagrama");
    }
  };

  const handleGenerate = async (prompt: string) => {
    try {
      const token = getToken();

      const { data: generated } = await api.post(
        "/openai/generate-diagram",
        { description: prompt },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { data: diagram } = await api.post("/diagram/create", {
        name: generated?.diagramName || "Diagrama gerado por IA",
        userId,
      });

      if (!diagram?.id) {
        throw new Error("Não foi possível criar o diagrama");
      }

      await api.put(
        `/diagram/${diagram.id}`,
        {
          name: generated?.diagramName,
          nodes: generated?.nodes ?? [],
          edges: generated?.edges ?? [],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setIsGenerateDiagramModalOpen(false);
      navigate(`/model/${diagram.id}`);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;
      messageApi.error(errorMessage || "Ocorreu um erro ao gerar o diagrama");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const token = getToken();
      await api.delete(`/diagram/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecent((prev) => prev.filter((p) => p.id !== id));
      messageApi.success("Diagrama excluído com sucesso.");
    } catch (error: any) {
      messageApi.error(error?.response?.data?.message || "Não foi possível excluir o diagrama.");
    } finally {
      setDeletingId(null);
    }
  };

  const recentDocuments = [...recent]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

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
        <Col xs={24} sm={12} md={8} lg={6}>
          <ProjectCard
            icon={<DatabaseOutlined />}
            title="Diagrama ER"
            description="Criar modelagem do zero"
            onClick={() => setIsCreateDiagramModalOpen(true)}
          />
        </Col>

        <Col xs={24} sm={12} md={8} lg={6}>
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

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {recentDocuments.map((project) => (
            <Col key={project.id} xs={24} sm={12} lg={8} xl={6}>
              <DiagramCard
                document={project}
                isDeleting={deletingId === project.id}
                onDelete={handleDelete}
              />
            </Col>
          ))}
        </Row>
      </div>
    </AppLayout>
  );
};

export default MainPage;
