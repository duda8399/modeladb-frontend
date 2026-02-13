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
import { UserOutlined, UploadOutlined } from "@ant-design/icons";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";

const { Title, Text } = Typography;

const ProfilePage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (id) loadUser(id);
  }, []);

  async function loadUser(id: string) {
    try {
      setLoading(true);

      const { data } = await api.get(`/user/${id}`);

      form.setFieldsValue({
        name: data.name,
      });
    } catch (error) {
      messageApi.error("Erro ao carregar usuário");
    } finally {
      setLoading(false);
    }
  }

  async function onFinish(values: any) {
    try {
      setLoading(true);

      console.log(values);

      messageApi.success("Perfil atualizado com sucesso!");
    } catch (error) {
      messageApi.error("Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
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
            <Avatar size={200} icon={<UserOutlined />} />

            <Upload showUploadList={false}>
              <Button icon={<UploadOutlined />}>Alterar foto</Button>
            </Upload>
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
