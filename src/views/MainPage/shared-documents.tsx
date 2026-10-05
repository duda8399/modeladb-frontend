import React, { useEffect, useState } from "react";
import { Col, Empty, Row, Typography, message } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { getCurrentUser } from "../../utils/auth";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";
import { DocumentsLoading } from "../../components/DashboardComponents/DocumentsLoading";

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
  const [loading, setLoading] = useState(true);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadSharedDocuments() {
      try {
        const { data } = await api.get("/diagram/shared-with-me");
        setSharedDocuments(data);
      } catch (e) {
        console.log(e);
      } finally {
        setLoading(false);
      }
    }

    loadSharedDocuments();
  }, []);

  // Remove o proprio usuario da lista de colaboradores do diagrama. O backend
  // permite essa remocao para o dono ou para o proprio colaborador.
  async function leaveDiagram(id: string) {
    const userId = getCurrentUser()?.id;
    if (!userId) {
      message.error("Sessão expirada. Faça login novamente.");
      return;
    }

    try {
      setLeavingId(id);
      await api.delete(`/diagram/${id}/collaborators/${userId}`);
      setSharedDocuments((docs) => docs.filter((doc) => doc.id !== id));
      message.success("Você saiu do diagrama.");
    } catch (e) {
      console.log(e);
      message.error("Não foi possível sair do diagrama.");
    } finally {
      setLeavingId(null);
    }
  }

  return (
    <AppLayout>
      <Title level={3}>Compartilhados comigo</Title>

      {loading ? (
        <DocumentsLoading />
      ) : (
        <>
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
                  isShared
                  onLeave={leaveDiagram}
                  isLeaving={leavingId === doc.id}
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
        </>
      )}
    </AppLayout>
  );
};

export default SharedDocumentsPage;
