import React, { useEffect, useState } from "react";
import { Col, Row, Typography } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";
import { getCurrentUser, getToken } from "../../utils/auth";

const { Title } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

const MyDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Project[]>([]);

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

  return (
    <AppLayout>
      <Title level={3}>Meus documentos</Title>

      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {documents.map((doc) => (
          <Col key={doc.id}>
            <DiagramCard
              document={doc}
            />
          </Col>
        ))}
      </Row>
    </AppLayout>
  );
};

export default MyDocumentsPage;
