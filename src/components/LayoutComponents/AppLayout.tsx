import { Layout } from "antd";
import { useState } from "react";
import { HeaderBar } from "../LayoutComponents/HeaderBar";
import { Sidebar } from "../LayoutComponents/Sidebar";

const { Content } = Layout;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout>
      <Sidebar collapsed={collapsed} />

      <Layout style={{ minHeight: "98vh" }}>
        <HeaderBar collapsed={collapsed} setCollapsed={setCollapsed} />

        <Content
          style={{
            margin: "24px 16px",
            padding: "5px 20px",
            background: "#fff",
            borderRadius: 2,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
