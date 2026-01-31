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
} from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LogoImage from "../../assets/logo.png";
import Background from "../../assets/fundo.png";

const { Header, Content } = Layout;
const { Title, Link } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();

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
          style={{
            height: 100,
            cursor: "pointer",
          }}
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

            <Form layout="vertical">
              <Form.Item label="Endereço de e-mail" name="login">
                <Input size="large" placeholder="Endereço de e-mail" />
              </Form.Item>

              <Form.Item label="Senha" name="password">
                <Input.Password size="large" placeholder="Senha" />
              </Form.Item>
            </Form>

            <Row justify="end" align="middle">
              <Link>Esqueceu sua senha?</Link>
            </Row>

            <Button
              type="primary"
              size="large"
              block
              style={{ marginTop: 24 }}
              onClick={() => navigate("/dashboard")}
            >
              Login
            </Button>

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
