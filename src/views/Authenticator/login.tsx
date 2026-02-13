import { Typography, Input, Button, Divider, Form, message, Row } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useState } from "react";
import { AuthLayout } from "../../components/LayoutComponents/AuthLayout";
import Background from "../../assets/fundo.png";

const { Title, Text, Link } = Typography;

type LoginFormData = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function handleLogin(data: LoginFormData) {
    try {
      setLoading(true);

      const response = await api.post("/auth/login", data);
      const { userId, accessToken } = response.data;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("userId", userId);
      navigate("/");
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;

      const messageText =
        !errorMessage || errorMessage === "Unauthorized"
          ? "E-mail ou senha inválidos"
          : errorMessage;

      messageApi.error(messageText);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout background={Background}>
      {contextHolder}

      <Title level={3} style={{ textAlign: "center" }}>
        Bem-vindo(a)
      </Title>

      <Text
        type="secondary"
        style={{ display: "block", textAlign: "center", marginBottom: 32 }}
      >
        Faça o login para acessar os recursos do ModelaDB
      </Text>

      <Form layout="vertical" onFinish={handleLogin}>
        <Form.Item
          name="email"
          rules={[
            { required: true, message: "Informe seu e-mail" },
            { type: "email", message: "E-mail inválido" },
          ]}
        >
          <Input
            size="large"
            placeholder="Endereço de e-mail"
            prefix={<MailOutlined style={{ color: "#bfbfbf" }} />}
          />
        </Form.Item>

        <Form.Item
          name="password"
          rules={[{ required: true, message: "Informe sua senha" }]}
        >
          <Input.Password
            size="large"
            placeholder="Senha"
            prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
          />
        </Form.Item>

        <Row justify="end" style={{ marginBottom: 16 }}>
          <Link onClick={() => navigate("/forgot-password")}>
            Esqueceu a senha?
          </Link>
        </Row>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
        >
          Entrar
        </Button>
      </Form>

      <Divider />

      <Text style={{ display: "block", textAlign: "center", marginTop: 24 }}>
        Não tem uma conta?{" "}
        <Link onClick={() => navigate("/register")}>Criar conta</Link>
      </Text>
    </AuthLayout>
  );
}
