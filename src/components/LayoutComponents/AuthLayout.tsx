import { Layout, Row, Col, Card } from "antd";
import DefaultBackground from "../../assets/fundo.png";

type AuthLayoutProps = {
  children: React.ReactNode;
  background?: string;
};

export function AuthLayout({ children, background = DefaultBackground }: AuthLayoutProps) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Row align="stretch" style={{ minHeight: "100vh" }}>
        <Col
          xs={0}
          md={12}
          style={{
            padding: "50px 0 50px 50px",
            boxSizing: "border-box",
            display: "flex",
          }}
        >
          <div
            role="img"
            aria-label="Ilustração"
            style={{
              flex: 1,
              backgroundImage: `url(${background})`,
              backgroundSize: "cover",
              backgroundPosition: "left top",
              backgroundRepeat: "no-repeat",
              backgroundColor: "#2e6b3a",
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
            boxSizing: "border-box",
          }}
        >
          <Card
            style={{
              flex: 1,
              borderRadius: "0 12px 12px 0",
              padding: "40px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {children}
          </Card>
        </Col>
      </Row>
    </Layout>
  );
}
