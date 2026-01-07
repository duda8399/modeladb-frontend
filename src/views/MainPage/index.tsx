import { Layout, Row, Col, Typography } from 'antd';
import { HeaderBar } from '../../components/DashboardComponents/HeaderBar';
import { ProjectCard } from '../../components/DashboardComponents/ProjectCard';
import { useNavigate } from 'react-router-dom';

const { Content } = Layout;
const { Title } = Typography;

export default function MainPage() {
    const navigate = useNavigate();

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <HeaderBar />

            <Content style={{ padding: '24px' }}>
                <Title level={4}>Criar novo projeto</Title>

                <Row gutter={[16, 16]}>
                    <Col>
                        <ProjectCard title="Novo Projeto" description="Criar modelagem do zero" onClick={() => navigate('/model')} />
                    </Col>

                    <Col>
                        <ProjectCard title="Modelo ER" description="Diagrama ER" />
                    </Col>

                    <Col>
                        <ProjectCard title="Modelo Relacional" description="Tabelas e chaves" />
                    </Col>
                </Row>
            </Content>
        </Layout>
    );
}
