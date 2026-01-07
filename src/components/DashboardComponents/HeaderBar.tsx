import { Layout, Input, Avatar, Space } from 'antd';
import { SearchOutlined, UserOutlined } from '@ant-design/icons';

const { Header } = Layout;

export function HeaderBar() {
    return (
        <Header
            style={{
                background: '#2f9e41',
                padding: '0 24px',
                margin: '0px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #f0f0f0',
            }}
        >
            <Input
                prefix={<SearchOutlined />}
                placeholder="Pesquisar projetos, diagramas, tabelas..."
                style={{ maxWidth: 400 }}
            />

            <Space>
                <Avatar icon={<UserOutlined />} />
            </Space>
        </Header>
    );
}
