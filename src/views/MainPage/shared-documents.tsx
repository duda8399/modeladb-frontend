import React, { useEffect, useState } from "react";
import { Typography } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";

const { Title } = Typography;

interface Project {
  id: string;
  name: string;
  updatedAt: string;
}

const SharedDocumentsPage: React.FC = () => {
  const [recent, setRecent] = useState<Project[]>([]);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const { data } = await api.get("/diagram/recent");
      setRecent(data);
    } catch (e) {
      console.log(e);
    }
  }

  return (
    <AppLayout>
      <Title level={3}>Compartilhados comigo</Title>
    </AppLayout>
  );
};

export default SharedDocumentsPage;
