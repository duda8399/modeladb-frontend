import React, { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Col,
  Form,
  Input,
  Row,
  Typography,
  Upload,
  message,
  Divider,
} from "antd";
import { UserOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import axios from "axios";
import { api } from "../../services/api";

const { Title, Text } = Typography;

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  if (error.response?.status === 413) return "A imagem deve ter no máximo 2 MB.";

  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message[0] ?? fallback;
  return typeof message === "string" ? message : fallback;
}

const ProfilePage: React.FC = () => {
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();

  const [openaiTokenHint, setOpenaiTokenHint] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUser() {
    try {
      setLoading(true);

      const { data } = await api.get("/user/me");

      form.setFieldsValue({
        name: data.name,
        openaiToken: "",
      });
      setOpenaiTokenHint(data.hasOpenaiToken ? data.openaiTokenHint : null);

      if (data.avatarUrl) {
        setAvatarPreview(data.avatarUrl);
      }
    } catch (error) {
      messageApi.error("Erro ao carregar usuário");
    } finally {
      setLoading(false);
    }
  }

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

  async function onFinish(values: any) {
    try {
      setLoading(true);

      const token = values.openaiToken?.trim() ?? "";

      if (token) {
        const valid = await validateOpenAIToken(token);
        if (!valid) {
          messageApi.error("Token da OpenAI inválido. Verifique e tente novamente.");
          setLoading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append("name", values.name);

      if (values.password) {
        formData.append("password", values.password);
      }

      if (token) {
        formData.append("openaiToken", token);
      }

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      } else if (!avatarPreview) {
        formData.append("avatarUrl", "");
      }

      const { data } = await api.put("/user/me", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setOpenaiTokenHint(data.hasOpenaiToken ? data.openaiTokenHint : null);
      form.setFieldsValue({ openaiToken: "", password: "", confirmPassword: "" });
      setAvatarFile(null);

      const newAvatarUrl = data.avatarUrl ?? "";
      localStorage.setItem("avatar", newAvatarUrl);
      window.dispatchEvent(new StorageEvent("storage", { key: "avatar", newValue: newAvatarUrl }));

      messageApi.success("Perfil atualizado com sucesso!");
    } catch (error) {
      messageApi.error(apiErrorMessage(error, "Erro ao atualizar perfil"));
    } finally {
      setLoading(false);
    }
  }

  async function removeOpenAIToken() {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("openaiToken", "");

      await api.put("/user/me", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setOpenaiTokenHint(null);
      messageApi.success("Chave da OpenAI removida.");
    } catch (error) {
      messageApi.error(apiErrorMessage(error, "Erro ao remover a chave"));
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarSelected(file: File) {
    if (!AVATAR_TYPES.includes(file.type)) {
      messageApi.error("Envie uma imagem PNG, JPEG, GIF ou WebP.");
      return Upload.LIST_IGNORE;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      messageApi.error("A imagem deve ter no máximo 2 MB.");
      return Upload.LIST_IGNORE;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    return false;
  }

  return (
    <AppLayout>
      {contextHolder}

      <Title level={3}>Meu perfil</Title>
      <Text type="secondary">Atualize suas informações pessoais e senha</Text>

      <Divider />

      <Row gutter={[32, 32]}>
        <Col xs={24} md={8}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Avatar size={250} src={avatarPreview} icon={<UserOutlined />} />

            <Upload
              showUploadList={false}
              accept={AVATAR_TYPES.join(",")}
              beforeUpload={handleAvatarSelected}
            >
              <Button icon={<UploadOutlined />} style={{ width: 140, height: "31.7px", padding: "0 16px" }}>Alterar foto</Button>
            </Upload>

            {avatarPreview && (
              <Button
                danger
                icon={<DeleteOutlined />}
                style={{ width: 140, height: 30, padding: "0 16px" }}
                onClick={() => {
                  setAvatarPreview(undefined);
                  setAvatarFile(null);
                }}
              >
                Remover foto
              </Button>
            )}
          </div>
        </Col>

        <Col xs={24} md={16}>
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="Nome"
              name="name"
              rules={[{ required: true, message: "Informe seu nome" }]}
            >
              <Input size="large" placeholder="Seu nome" />
            </Form.Item>

            <Divider />

            <Title level={5}>Alterar senha</Title>

            <Form.Item
              label="Nova senha"
              name="password"
              rules={[{ min: 6, message: "Mínimo de 6 caracteres" }]}
            >
              <Input.Password size="large" placeholder="Digite a nova senha" />
            </Form.Item>

            <Form.Item
              label="Confirmar nova senha"
              name="confirmPassword"
              dependencies={["password"]}
              hasFeedback
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("As senhas não coincidem"));
                  },
                }),
              ]}
            >
              <Input.Password
                size="large"
                placeholder="Confirme a nova senha"
              />
            </Form.Item>

            <Divider />

            <Title level={5}>Integrações</Title>

            <Form.Item
              label="Token da OpenAI"
              name="openaiToken"
              extra={
                openaiTokenHint
                  ? `Chave cadastrada (termina em ${openaiTokenHint.replace("…", "")}). Ela fica criptografada e nunca é exibida. Preencha apenas para substituí-la.`
                  : "Seu token é armazenado criptografado e usado para gerar sugestões com IA."
              }
            >
              <Input.Password
                size="large"
                placeholder={openaiTokenHint ? `sk-...${openaiTokenHint.replace("…", "")}` : "sk-..."}
              />
            </Form.Item>

            {openaiTokenHint && (
              <div style={{ marginBottom: 24 }}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={removeOpenAIToken}
                  disabled={loading}
                >
                  Remover chave da OpenAI
                </Button>
              </div>
            )}

            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
            >
              Salvar alterações
            </Button>
          </Form>
        </Col>
      </Row>
    </AppLayout>
  );
};

export default ProfilePage;
