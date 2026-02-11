import { Layout, Row, Col, Card } from "antd";
import DefaultBackground from "../../assets/fundo.png";

type AuthLayoutProps = {
  children: React.ReactNode;
  background?: string;
};

export function AuthLayout({ children, background = DefaultBackground }: AuthLayoutProps) {
  return (
    <Layout style={{ height: "100vh" }}>
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
            src={background}
            alt="Ilustração"
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
              padding: "40px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            {children}
          </Card>
        </Col>
      </Row>
    </Layout>
  );
}
