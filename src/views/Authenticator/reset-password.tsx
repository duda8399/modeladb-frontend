import {
  Typography,
  Input,
  Button,
  Form,
  message,
} from "antd";
import { api } from "../../services/api";
import Link from "antd/es/typography/Link";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthLayout } from "../../components/LayoutComponents/AuthLayout";
import Background from "../../assets/fundo-auth.png";

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function handleResetPassword(values: { password: string }) {
    try {
      setLoading(true);

      await api.post(
        "/auth/reset-password",
        { password: values.password },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      messageApi.success("Senha redefinida com sucesso.");

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;

      const messageText =
        !errorMessage || errorMessage === "Unauthorized"
          ? "Erro ao redefinir senha."
          : errorMessage;

      messageApi.error(messageText);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout background={Background}>
      {contextHolder}
      <Title level={3} style={{ textAlign: "center", paddingBottom: 15 }}>
        Redefinir senha
      </Title>

      <Form layout="vertical" form={form} onFinish={handleResetPassword}>
        <Form.Item
          label="Nova senha"
          name="password"
          rules={[
            { required: true, message: "Crie uma nova senha" },
            { min: 6, message: "Mínimo de 6 caracteres" },
          ]}
        >
          <Input.Password size="large" placeholder="Crie uma nova senha" />
        </Form.Item>

        <Form.Item
          label="Confirmar senha"
          name="confirmPassword"
          dependencies={["password"]}
          hasFeedback
          rules={[
            { required: true, message: "Confirme sua senha" },
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
          <Input.Password size="large" placeholder="Confirme sua senha" />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
          style={{
            height: 48,
            fontSize: 16,
            borderRadius: 8,
            marginTop: 15,
          }}
        >
          Enviar
        </Button>

        <Text style={{ display: "block", textAlign: "end", paddingTop: 30 }}>
          <Link onClick={() => navigate("/login")}>
            Retornar à tela de login
          </Link>
        </Text>
      </Form>
    </AuthLayout>
  );
}
