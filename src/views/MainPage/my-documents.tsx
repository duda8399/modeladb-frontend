import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Col,
  Empty,
  Input,
  Pagination,
  Row,
  Typography,
  message,
} from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { getCurrentUser, getToken } from "../../utils/auth";
import { DiagramCard } from "../../components/DashboardComponents/DiagramCard";
import type { DiagramSummary } from "../../services/diagramsService";
import { DocumentsLoading } from "../../components/DashboardComponents/DocumentsLoading";
import CreateDiagramModal from "../../components/DashboardComponents/CreateDiagramModal";

const { Title } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
}

const MyDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isCreateDiagramModalOpen, setIsCreateDiagramModalOpen] =
    useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [messageApi, contextHolder] = message.useMessage();

  const calculatePageSize = () => {
    const cardRowHeight = 170;
    const availableHeight = window.innerHeight;
    const colsPerRow =
      window.innerWidth >= 1200 ? 3 : window.innerWidth >= 768 ? 2 : 1;
    const rowsCanFit = Math.max(1, Math.floor(availableHeight / cardRowHeight));

    return Math.min(rowsCanFit * colsPerRow, 9);
  };

  useEffect(() => {
    setPageSize(calculatePageSize());

    const handleResize = () => {
      setPageSize(calculatePageSize());
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return documents;
    }

    return documents.filter((doc) =>
      doc.name.toLowerCase().includes(normalizedSearch),
    );
  }, [documents, searchTerm]);

  const paginatedDocuments = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredDocuments.slice(startIndex, startIndex + pageSize);
  }, [filteredDocuments, currentPage, pageSize]);

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredDocuments.length / pageSize),
    );

    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredDocuments.length, currentPage, pageSize]);

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
    } finally {
      setLoading(false);
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

  async function createDiagram(name: string) {
    try {
      const currentUser = getCurrentUser();
      const userId = currentUser?.id;

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
  }

  return (
    <AppLayout>
      {contextHolder}

      <CreateDiagramModal
        open={isCreateDiagramModalOpen}
        onClose={() => setIsCreateDiagramModalOpen(false)}
        onCreate={createDiagram}
      />

      <Row align="middle" justify="space-between" gutter={[12, 12]}>
        <Col>
          <Title level={3} style={{ marginBottom: 0 }}>
            Meus documentos
          </Title>
        </Col>

        <Col>
          <Button
            type="primary"
            size="middle"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateDiagramModalOpen(true)}
          >
            Criar Diagrama
          </Button>
        </Col>
      </Row>

      <Input
        allowClear
        placeholder="Buscar por nome do documento"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        prefix={<SearchOutlined />}
        style={{ maxWidth: "100%", width: 450, marginTop: 15 }}
      />

      {loading ? (
        <DocumentsLoading />
      ) : (
        <>
          <Row
            gutter={[24, 24]}
            style={{ marginTop: 24, flex: 1, alignContent: "flex-start" }}
          >
            {paginatedDocuments.map((doc) => (
              <Col key={doc.id} xs={24} sm={24} md={12} lg={8}>
                <DiagramCard
                  document={doc}
                  onDelete={deleteDocument}
                  isDeleting={deletingId === doc.id}
                  onRenamed={(renamed: DiagramSummary) =>
                    setDocuments((prev) => prev.map((item) => (item.id === renamed.id ? { ...item, name: renamed.name } : item)))
                  }
                  onDuplicated={(copy: DiagramSummary) => setDocuments((prev) => [copy, ...prev])}
                />
              </Col>
            ))}
          </Row>

          {filteredDocuments.length === 0 && (
            <Empty
              description={
                searchTerm
                  ? "Nenhum documento encontrado"
                  : "Você ainda não possui documentos"
              }
              style={{ marginTop: 32 }}
            />
          )}

          {filteredDocuments.length > pageSize && (
            <Row justify="center" style={{ marginTop: 24, marginBottom: 24 }}>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={filteredDocuments.length}
                onChange={(page) => setCurrentPage(page)}
              />
            </Row>
          )}
        </>
      )}
    </AppLayout>
  );
};

export default MyDocumentsPage;
