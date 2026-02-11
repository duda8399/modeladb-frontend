import React from "react";
import { Col, Row } from "antd";
import { useNavigate } from "react-router-dom";
import Title from "antd/es/typography/Title";
import { ProjectCard } from "../../components/DashboardComponents/ProjectCard";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";

const MainPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <Title level={4}>Criar novo projeto</Title>

      <Row gutter={[16, 16]}>
        <Col>
          <ProjectCard
            title="Novo Projeto"
            description="Criar modelagem do zero"
            onClick={() => navigate("/model")}
          />
        </Col>
      </Row>
    </AppLayout>
  );
};

export default MainPage;
