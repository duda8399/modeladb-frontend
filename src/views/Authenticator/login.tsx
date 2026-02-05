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
import { GoogleOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Background from "../../assets/fundo.png";
import { api } from "../../services/api";

const { Title, Text, Link } = Typography;

type LoginFormData = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading] = message.useMessage();

  async function handleLogin(data: LoginFormData) {
    try {
      loading.open({
        type: "loading",
        content: "Entrando...",
      });

      const response = await api.post("/auth/login", data);
      const { accessToken } = response.data;

      localStorage.setItem("accessToken", accessToken);
      navigate("/");
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message || "E-mail ou senha inválidos",
      );
    } finally {
      loading.destroy();
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
            height: "100vh",
            padding: "50px 0 50px 50px",
            boxSizing: "border-box",
          }}
        >
          <img
            src={Background}
            alt="Ilustração ModelaDB"
            style={{
              width: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
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
              padding: "40px 40px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            <Title level={3} style={{ textAlign: "center" }}>
              Bem-vindo(a)
            </Title>

            <Text
              type="secondary"
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: 32,
              }}
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
                  prefix={
                    <MailOutlined
                      style={{
                        color: "#bfbfbf",
                        paddingRight: "5px",
                        fontSize: "18px",
                      }}
                    />
                  }
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: "Informe sua senha" }]}
              >
                <Input.Password
                  size="large"
                  placeholder="Senha"
                  prefix={
                    <LockOutlined
                      style={{
                        color: "#bfbfbf",
                        paddingRight: "5px",
                        fontSize: "18px",
                      }}
                    />
                  }
                />
              </Form.Item>

              <Row justify="end" style={{ marginBottom: 16 }}>
                <Link>Esqueceu a senha?</Link>
              </Row>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                style={{
                  height: 48,
                  fontSize: 16,
                  borderRadius: 8,
                }}
              >
                Entrar
              </Button>
            </Form>

            <Divider>ou</Divider>

            <Button
              block
              size="large"
              icon={<GoogleOutlined />}
              style={{ height: 48, borderRadius: 8 }}
            >
              Entrar com Google
            </Button>

            <Text
              style={{
                display: "block",
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Não tem uma conta?{" "}
              <Link onClick={() => navigate("/register")}>Criar conta</Link>
            </Text>
          </Card>
        </Col>
      </Row>
    </Layout>
  );
}
