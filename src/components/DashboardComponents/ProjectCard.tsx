import { Card } from 'antd';

interface ProjectCardProps {
    title: string;
    description?: string;
    onClick?: () => void;
}

export function ProjectCard({ title, description, onClick }: ProjectCardProps) {
    return (
        <Card
            hoverable
            style={{ width: 220 }}
            cover={
                <div
                    style={{
                        height: 120,
                        color: '#fff',
                        background: '#2f9e41',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 500,
                    }}
                >
                    {title}
                </div>
            }
            onClick={onClick}
        >
            <Card.Meta description={description} />
        </Card>
    );
}
