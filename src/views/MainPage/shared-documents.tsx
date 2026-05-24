import React, { useEffect, useState } from "react";
import { Typography } from "antd";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { api } from "../../services/api";
import { getToken } from "../../utils/auth";

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
      const token = getToken();

      const { data } = await api.get("/diagram/recent", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
