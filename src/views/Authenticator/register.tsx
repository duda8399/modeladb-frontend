import {
  Typography,
  Input,
  Button,
  Divider,
  Form,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import { register } from "../../services/auth.service";
import { useState } from "react";
import { AuthLayout } from "../../components/LayoutComponents/AuthLayout";
import Background from "../../assets/fundo.png";
const { Title, Link, Text } = Typography;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);

  async function onSubmit(values: any) {
    try {
      setLoading(true);

      await register(values);
      messageApi.success("Conta criada com sucesso!");

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout background={Background}>
      {contextHolder}

      <Title level={3} style={{ textAlign: "center" }}>
        Crie sua conta no ModelaDB
      </Title>

      <Text
        type="secondary"
        style={{
          display: "block",
          textAlign: "center",
          paddingBottom: 10,
        }}
      >
        Comece agora a modelar seu banco de dados
      </Text>

      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="Nome"
          name="name"
          rules={[{ required: true, message: "Informe seu nome" }]}
        >
          <Input size="large" placeholder="Seu nome completo" />
        </Form.Item>

        <Form.Item
          label="Endereço de e-mail"
          name="email"
          rules={[
            { required: true, message: "Informe seu e-mail" },
            { type: "email", message: "E-mail inválido" },
          ]}
        >
          <Input size="large" placeholder="Endereço de e-mail" />
        </Form.Item>

        <Form.Item
          label="Senha"
          name="password"
          rules={[
            { required: true, message: "Crie uma senha" },
            { min: 6, message: "Mínimo de 6 caracteres" },
          ]}
        >
          <Input.Password size="large" placeholder="Crie uma senha" />
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
          size="large"
          block
          htmlType="submit"
          loading={loading}
        >
          Criar conta
        </Button>
      </Form>

      <Divider />

      <Text style={{ display: "block", textAlign: "center", paddingTop: 10 }}>
        Já possui uma conta?{" "}
        <Link onClick={() => navigate("/")}>Faça login</Link>
      </Text>
    </AuthLayout>
  );
}
