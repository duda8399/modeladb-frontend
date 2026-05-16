import { Layout } from "antd";
import { useState } from "react";
import { HeaderBar } from "../LayoutComponents/HeaderBar";
import { Sidebar } from "../LayoutComponents/Sidebar";

const { Content } = Layout;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} />

      <Layout style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />

        <Content
          style={{
            margin: "24px 16px",
            padding: "5px 20px",
            background: "#fff",
            borderRadius: 2,
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
