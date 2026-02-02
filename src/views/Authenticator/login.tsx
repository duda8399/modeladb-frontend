import {
  Layout,
  Row,
  Col,
  Typography,
  Input,
  Button,
  Card,
  Divider,
  Form,
  message,
} from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LogoImage from "../../assets/logo.png";
import Background from "../../assets/fundo.png";
import { api } from "../../services/api";

const { Header, Content } = Layout;
const { Title, Link } = Typography;

type LoginFormData = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading] = message.useMessage();

  async function handleLogin(data: LoginFormData) {
    try {
      loading.open({
        type: "loading",
        content: "Entrando...",
      });

      const response = await api.post("/auth/login", {
        email: data.email,
        password: data.password,
      });

      console.log("response", response);

      const { accessToken } = response.data;

      localStorage.setItem("accessToken", accessToken);

      message.success("Login realizado com sucesso!");
      navigate("/dashboard");
    } catch (error: any) {
      message.error(
        error?.response?.data?.message || "E-mail ou senha inválidos",
      );
    } finally {
      loading.destroy();
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
            alt="Entrar"
            style={{
              width: 200,
              height: 100,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        </div>

        <Button type="primary" onClick={() => navigate("/register")}>
          Criar conta
        </Button>
      </Header>

      <Content style={{ padding: "48px 32px" }}>
        <Row gutter={64} justify="center">
          <Col xs={24} md={12} lg={10}>
            <Title level={1} style={{ textAlign: "center" }}>
              Faça login e comece a modelar seu banco de dados
            </Title>

            <Form layout="vertical" onFinish={handleLogin}>
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
                rules={[{ required: true, message: "Informe sua senha" }]}
              >
                <Input.Password size="large" placeholder="Senha" />
              </Form.Item>

              <Row justify="end">
                <Link>Esqueceu sua senha?</Link>
              </Row>

              <Button
                type="primary"
                size="large"
                block
                htmlType="submit"
                style={{ marginTop: 24 }}
              >
                Login
              </Button>
            </Form>

            <Divider>ou</Divider>

            <Button block icon={<GoogleOutlined />} size="large">
              Faça login com Google
            </Button>
          </Col>

          <Col xs={0} md={12} lg={10}>
            <Card
              style={{
                backgroundColor: "#2f9e41",
                color: "#fff",
              }}
            >
              <img
                src={Background}
                alt="Ilustração"
                style={{ width: "100%" }}
              />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
