import {
  Layout,
  Row,
  Col,
  Typography,
  Input,
  Button,
  Card,
  Form,
  message,
} from "antd";
import { MailOutlined } from "@ant-design/icons";
import Background from "../../assets/fundo.png";
import { api } from "../../services/api";
import Link from "antd/es/typography/Link";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  async function handleForgotPassword(values: { email: string }) {
    try {
      setLoading(true);

      await api.post("/auth/forgot-password", {email: values.email});
      messageApi.success("E-mail de recuperação de senha enviado.");

      form.resetFields();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;

      const messageText =
        !errorMessage || errorMessage === "Unauthorized"
          ? "E-mail inválido"
          : errorMessage;

      messageApi.error(messageText);
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
              padding: "100px 50px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            <Title level={3} style={{ textAlign: "center", paddingBottom: 15 }}>
              Recuperar senha
            </Title>

            <Form layout="vertical" form={form} onFinish={handleForgotPassword}>
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

              <Text
                style={{ display: "block", textAlign: "end", paddingTop: 30 }}
              >
                <Link onClick={() => navigate("/login")}>
                  Retornar à tela de login
                </Link>
              </Text>
            </Form>
          </Card>
        </Col>
      </Row>
    </Layout>
  );
}
