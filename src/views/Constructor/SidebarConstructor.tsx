import { useState } from "react";
import { Input, Button, Modal, Form, message } from "antd";
import {
  AppstoreOutlined,
  BorderOutlined,
  DatabaseOutlined,
  FileOutlined,
  FontSizeOutlined,
  KeyOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "../../services/api";
import { getCurrentUser } from "../../utils/auth";

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
  onAddNote: () => void;
  onAddSection: () => void;
  onAddText: () => void;
  onGenerate?: (prompt: string) => void;
}

export function SidebarConstructor({ onAddEntity, onAddNote, onAddSection, onAddText, onGenerate }: Props) {
  const [prompt, setPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [tokenForm] = Form.useForm();

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
    if (!prompt.trim()) {
      messageApi.warning("Descreva a estrutura e os requisitos do seu banco de dados antes de gerá-lo.");
      return;
    }

    const user = getCurrentUser();
    if (!user) return;

    const { data } = await api.get(`/user/${user.id}`);

    if (!data.openaiToken) {
      setModalOpen(true);
      return;
    }

    onGenerate?.(prompt);
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

      const user = getCurrentUser();
      if (!user) return;

      const formData = new FormData();
      formData.append("openaiToken", token);
      await api.put(`/user/${user.id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      messageApi.success("Chave de API salva com sucesso!");
      setModalOpen(false);
      tokenForm.resetFields();
      onGenerate?.(prompt);
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
        borderRight: "1px solid #e5e7eb",
        padding: 12,
        fontSize: 13,
      }}
    >
      {contextHolder}

      <div
        style={{
          paddingTop: 20,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 10,
          }}
        >
          <RobotOutlined style={{ color: "#1677ff", fontSize: 16 }} />
          <span style={{ fontWeight: "bold" }}>IA do ModelaDB</span>
        </div>

        <Input.TextArea
          placeholder="Descreva seu banco de dados..."
          autoSize={{ minRows: 3, maxRows: 5 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 10,
          }}
        >
          <Button
            style={{
              backgroundColor: "#2F7D32",
              color: "#fff",
            }}
            icon={<ThunderboltOutlined />}
            onClick={handleGenerateClick}
          >
            Gerar
          </Button>
        </div>
      </div>

      <div
        style={{
          paddingTop: 20,
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingBottom: 10,
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
            icon={<FontSizeOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            title="Adicionar Seção"
            style={{ height: 60 }}
            onClick={onAddSection}
            icon={<BorderOutlined style={{ fontSize: 20 }} />}
          />
          <Button
            block
            title="Adicionar Nota"
            style={{ height: 60 }}
            onClick={onAddNote}
            icon={<FileOutlined style={{ fontSize: 20, color: '#facc15' }} />}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 20,
          paddingBottom: 10,
        }}
      >
        <DatabaseOutlined style={{ color: "#fa8c16", fontSize: 16 }} />
        <span style={{ fontWeight: "bold" }}>ER</span>
      </div>

      <div style={nodeStyle} onClick={onAddEntity}>
        Adicionar Entidade
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
    </aside>
  );
}
