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
} from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LogoImage from "../../assets/logo.png";
import { register } from "../../services/auth.service";
import { useState } from "react";

const { Header, Content } = Layout;
const { Title, Link, Text } = Typography;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function onSubmit(values: any) {
    try {
      setLoading(true);

      await register(values);

      message.success("Conta criada com sucesso!");
      navigate("/");
    } catch (error: any) {
      message.error(error?.response?.data?.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout style={{ background: "#fff", overflow: "hidden" }}>
      <Header
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 32px",
        }}
      >
        <div
          onClick={() => navigate("/")}
          style={{ height: 100, cursor: "pointer" }}
        >
          <img
            src={LogoImage}
            alt="ModelaDB"
            style={{
              width: 200,
              height: 100,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        </div>

        <Button type="primary" onClick={() => navigate("/")}>
          Já tenho conta
        </Button>
      </Header>

      <Content style={{ padding: "48px 32px" }}>
        <Row gutter={64} justify="center">
          <Col
            xs={24}
            md={12}
            lg={10}
            style={{
              backgroundColor: "#f0efef",
              borderRadius: 10,
              padding: 30,
            }}
          >
            <Title level={1} style={{ textAlign: "center" }}>
              Crie sua conta no ModelaDB
            </Title>

            <Text
              type="secondary"
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              Comece agora a modelar seus bancos de dados
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

              <Button
                type="primary"
                size="large"
                block
                htmlType="submit"
                loading={loading}
                style={{ marginTop: 10 }}
              >
                Criar conta
              </Button>
            </Form>

            <Divider>ou</Divider>

            <Button block icon={<GoogleOutlined />} size="large">
              Criar conta com Google
            </Button>

            <Text
              style={{ display: "block", textAlign: "center", marginTop: 24 }}
            >
              Já possui uma conta?{" "}
              <Link onClick={() => navigate("/")}>Faça login</Link>
            </Text>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
