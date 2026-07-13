import React, { useEffect, useState } from "react";
import { Col, Empty, Row, Typography } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";

const { Title } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
  role: "EDITOR" | "VIEWER";
  owner: { id: string; name: string; email: string };
}

const SharedDocumentsPage: React.FC = () => {
  const [sharedDocuments, setSharedDocuments] = useState<Project[]>([]);

  useEffect(() => {
    loadSharedDocuments();
  }, []);

  async function loadSharedDocuments() {
    try {
      const { data } = await api.get("/diagram/shared-with-me");
      setSharedDocuments(data);
    } catch (e) {
      console.log(e);
    }
  }

  return (
    <AppLayout>
      <Title level={3}>Compartilhados comigo</Title>

      <Row
        gutter={[24, 24]}
        style={{ marginTop: 24, flex: 1, alignContent: "flex-start" }}
      >
        {sharedDocuments.map((doc) => (
          <Col key={doc.id} xs={24} sm={24} md={12} lg={8}>
            <DiagramCard
              document={doc}
              roleLabel={doc.role === "EDITOR" ? "Editor" : "Visualizador"}
              ownerName={doc.owner?.name || doc.owner?.email}
            />
          </Col>
        ))}
      </Row>

      {sharedDocuments.length === 0 && (
        <Empty
          description="Nenhum diagrama foi compartilhado com você ainda"
          style={{ marginTop: 32 }}
        />
      )}
    </AppLayout>
  );
};

export default SharedDocumentsPage;
