import { useState } from "react";
import { Input, Button, Modal, Form, message } from "antd";
import {
  AppstoreOutlined,
  BorderOutlined,
  BulbOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExportOutlined,
  FileOutlined,
  FontSizeOutlined,
  KeyOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { SiMysql, SiPostgresql } from "react-icons/si";
import { api } from "../../services/api";
import type { SqlDialect } from "../../utils/sqlExport";
import type { CustomEdge, CustomNode } from "../../types/diagramER";
import { SqlExportModal } from "../../components/ConstructorComponents/SqlExportModal";

const nodeStyle = {
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
  cursor: "grab",
  fontSize: 13,
  marginBottom: 8,
  transition: "all 0.2s",
  fontWeight: "normal",
  textAlign: "center" as const,
};

interface Props {
  onAddEntity: () => void;
  onAddView: () => void;
  onAddNote: () => void;
  onAddSection: () => void;
  onAddText: () => void;
  onGenerate?: (prompt: string) => void;
  onAnalyze?: () => void;
  generating?: boolean;
  diagramName: string;
  onDiagramNameChange: (name: string) => void;
  nodes: CustomNode[];
  edges: CustomEdge[];
  readOnly?: boolean;
}

export function SidebarConstructor({
  onAddEntity,
  onAddView,
  onAddNote,
  onAddSection,
  onAddText,
  onGenerate,
  onAnalyze,
  generating,
  diagramName,
  onDiagramNameChange,
  nodes,
  edges,
  readOnly = false,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [tokenForm] = Form.useForm();
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [tokenPurpose, setTokenPurpose] = useState<"generate" | "analyze">("generate");
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>("mysql");

  async function validateOpenAIToken(token: string): Promise<boolean> {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleGenerateClick() {
    if (generating) return;

    if (!prompt.trim()) {
      messageApi.warning("Descreva a estrutura e os requisitos do seu banco de dados antes de gerá-lo.");
      return;
    }

    if (await ensureOpenAIToken("generate")) onGenerate?.(prompt);
  }

  async function ensureOpenAIToken(purpose: "generate" | "analyze"): Promise<boolean> {
    const { data } = await api.get("/user/me");

    if (!data.hasOpenaiToken) {
      setTokenPurpose(purpose);
      setModalOpen(true);
      return false;
    }

    return true;
  }

  async function handleAnalyzeClick() {
    if (await ensureOpenAIToken("analyze")) onAnalyze?.();
  }

  function handleExportSql(dialect: SqlDialect) {
    const tableCount = nodes.filter((node) => node.type === "entityNode").length;

    if (tableCount === 0) {
      messageApi.warning("Adicione ao menos uma entidade antes de exportar.");
      return;
    }

    setSqlDialect(dialect);
    setSqlModalOpen(true);
  }

  async function handleSaveToken(values: { openaiToken: string }) {
    const token = values.openaiToken.trim();

    try {
      setTokenLoading(true);

      const valid = await validateOpenAIToken(token);
      if (!valid) {
        messageApi.error("Chave de API inválida. Verifique e tente novamente.");
        return;
      }

      const formData = new FormData();
      formData.append("openaiToken", token);
      await api.put("/user/me", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      messageApi.success("Chave de API salva com sucesso!");
      setModalOpen(false);
      tokenForm.resetFields();
      if (tokenPurpose === "analyze") onAnalyze?.();
      else onGenerate?.(prompt);
    } catch {
      messageApi.error("Erro ao salvar a chave de API.");
    } finally {
      setTokenLoading(false);
    }
  }

  return (
    <aside
      style={{
        background: "#fafafa",
        minHeight: "100%",
        width: 260,
        flexShrink: 0,
        overflowY: "auto",
        borderRight: "1px solid #e5e7eb",
        padding: 12,
        fontSize: 13,
      }}
    >
      {contextHolder}

      <div
        style={{
          paddingTop: 14,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          <EditOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>Nome do diagrama</span>
        </div>

        <Input
          value={diagramName}
          onChange={(e) => onDiagramNameChange(e.target.value)}
          placeholder="Nome do diagrama"
          aria-label="Nome do diagrama"
          disabled={readOnly}
        />
      </div>

      <div
        style={{
          paddingTop: 14,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          <RobotOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>IA do ModelaDB</span>
        </div>

        <Input.TextArea
          placeholder="Descreva seu banco de dados..."
          autoSize={{ minRows: 2, maxRows: 5 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 8,
          }}
        >
          <Button
            style={{
              backgroundColor: "#2F7D32",
              color: "#fff",
            }}
            icon={<ThunderboltOutlined />}
            onClick={handleGenerateClick}
            loading={generating}
            disabled={readOnly}
          >
            Gerar
          </Button>
        </div>

        <Button block icon={<BulbOutlined />} onClick={handleAnalyzeClick} style={{ marginTop: 8 }}>
          Analisar modelo
        </Button>
      </div>

      <div
        style={{
          paddingTop: 14,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          <AppstoreOutlined style={{ color: "#2F7D32", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>Padrão</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
          }}
        >
          <Button
            block
            title="Adicionar Texto"
            style={{ height: 60 }}
            onClick={onAddText}
            disabled={readOnly}
            icon={<FontSizeOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            title="Adicionar Seção"
            style={{ height: 60 }}
            onClick={onAddSection}
            disabled={readOnly}
            icon={<BorderOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            title="Adicionar Nota"
            style={{ height: 60 }}
            onClick={onAddNote}
            disabled={readOnly}
            icon={<FileOutlined style={{ fontSize: 20, color: '#facc15' }} />}
          />
        </div>
      </div>

      <div
        style={{
          paddingTop: 14,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          <DatabaseOutlined style={{ color: "#fa8c16", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>ER</span>
        </div>

        <div
          style={
            readOnly ? { ...nodeStyle, opacity: 0.5, cursor: "not-allowed" } : nodeStyle
          }
          onClick={readOnly ? undefined : onAddEntity}
        >
          Adicionar Entidade
        </div>
        <div
          style={
            readOnly ? { ...nodeStyle, opacity: 0.5, cursor: "not-allowed" } : nodeStyle
          }
          onClick={readOnly ? undefined : onAddView}
        >
          Adicionar View
        </div>
      </div>

      <div
        style={{
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 8,
          }}
        >
          <ExportOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>Export</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 6,
          }}
        >
          <Button
            block
            title="Exportar para MySQL"
            style={{ height: 60 }}
            onClick={() => handleExportSql("mysql")}
            icon={<SiMysql style={{ fontSize: 50, color: "#00758F" }} />}
          />
          <Button
            block
            title="Exportar para PostgreSQL"
            style={{ height: 60 }}
            onClick={() => handleExportSql("postgres")}
            icon={<SiPostgresql style={{ fontSize: 40, color: "#336791" }} />}
          />
        </div>
      </div>

      <Modal
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyOutlined style={{ color: "#1677ff" }} />
            Configurar chave de API da OpenAI
          </span>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <p style={{ color: "#6b7280", marginBottom: 16 }}>
          Para usar a geração por IA você precisa de uma chave de API da OpenAI.
          Você também pode configurá-lo a qualquer momento nas{" "}
          <a href="/profile">configurações do perfil</a>.
        </p>

        <Form form={tokenForm} layout="vertical" onFinish={handleSaveToken}>
          <Form.Item
            label="Chave de API"
            name="openaiToken"
            rules={[{ required: true, message: "Informe a chave de API" }]}
          >
            <Input.Password size="large" placeholder="sk-..." />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={tokenLoading}>
              Salvar e gerar
            </Button>
          </div>
        </Form>
      </Modal>

      <SqlExportModal
        open={sqlModalOpen}
        onClose={() => setSqlModalOpen(false)}
        dialect={sqlDialect}
        onDialectChange={setSqlDialect}
        diagramName={diagramName}
        nodes={nodes}
        edges={edges}
      />
    </aside>
  );
}
