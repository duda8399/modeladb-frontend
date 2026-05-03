import React, { useEffect, useState } from "react";
import { Col, Row, Typography, message } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { getCurrentUser, getToken } from "../../utils/auth";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";

const { Title } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

const MyDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Project[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const currentUser = getCurrentUser();
      const token = getToken();

      if (!currentUser || !token) {
        setDocuments([]);
        return;
      }

      const { data } = await api.get("/diagram/my-documents", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setDocuments(data);
    } catch (e) {
      console.log(e);
    }
  }

  async function deleteDocument(id: string) {
    try {
      setDeletingId(id);
      const token = getToken();

      if (!token) {
        messageApi.error("Sessão expirada. Faça login novamente.");
        return;
      }

      await api.delete(`/diagram/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      messageApi.success("Documento excluído com sucesso.");
    } catch (e) {
      messageApi.error("Não foi possível excluir o documento.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppLayout>
      {contextHolder}
      <Title level={3}>Meus documentos</Title>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {documents.map((doc) => (
          <Col key={doc.id}>
            <DiagramCard
              document={doc}
              onDelete={deleteDocument}
              isDeleting={deletingId === doc.id}
            />
          </Col>
        ))}
      </Row>
    </AppLayout>
  );
};

export default MyDocumentsPage;
