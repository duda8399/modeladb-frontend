import {
  Layout,
  Row,
  Col,
  Typography,
  Input,
  Button,
  Divider,
  Form,
  message,
  Card,
} from "antd";
import { useNavigate } from "react-router-dom";
import { register } from "../../services/auth.service";
import { useState } from "react";
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
      navigate("/login");
    } catch (error: any) {
      messageApi.error(error?.response?.data?.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout style={{ height: "100vh" }}>
      {contextHolder}
      <Row style={{ height: "100vh" }}>
        <Col
          xs={0}
          md={12}
          style={{
            height: "100%",
            padding: "50px 0 50px 50px",
            boxSizing: "border-box",
          }}
        >
          <img
            src={Background}
            alt="Ilustração ModelaDB"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "12px 0 0 12px",
            }}
          />
        </Col>

        <Col
          xs={24}
          md={12}
          style={{
            padding: "50px 50px 50px 0",
            background: "#f6f9f7",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxSizing: "border-box",
          }}
        >
          <Card
            style={{
              width: "100%",
              minHeight: "100%",
              borderRadius: "0 12px 12px 0",
              padding: "0 40px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
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
                      return Promise.reject(
                        new Error("As senhas não coincidem"),
                      );
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

            <Text
              style={{ display: "block", textAlign: "center", paddingTop: 10 }}
            >
              Já possui uma conta?{" "}
              <Link onClick={() => navigate("/")}>Faça login</Link>
            </Text>
          </Card>
        </Col>
      </Row>
    </Layout>
  );
}
