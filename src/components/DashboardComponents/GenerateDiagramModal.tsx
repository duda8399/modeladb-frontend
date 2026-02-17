import React from "react";
import { Modal, Typography, Card, Input, Button, Space } from "antd";
import { Sparkles } from "lucide-react";

const { Title, Text } = Typography;
const { TextArea } = Input;

type GenerateDiagramModalProps = {
  open: boolean;
  onClose: () => void;
  onGenerate?: (prompt: string) => void;
};

const GenerateDiagramModal: React.FC<GenerateDiagramModalProps> = ({
  open,
  onClose,
  onGenerate,
}) => {
  const [prompt, setPrompt] = React.useState("");

  const handleGenerate = () => {
    if (onGenerate) {
      onGenerate(prompt);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      title={
        <Title level={4} style={{ margin: 0 }}>
          Como você gostaria de começar? 
        </Title>
      }
    >
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card
          style={{
            borderRadius: 12,
            background: "#fafafa",
          }}
          bodyStyle={{ padding: 24 }}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space align="center">
              <Sparkles size={18} color="#7c3aed" />
              <Text strong>Crie diagramas com IA</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                BETA
              </Text>
            </Space>

            <div>
              <Text strong>Descreva o diagrama</Text>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Generate a database model for IT asset management."
                rows={5}
                style={{ marginTop: 8, borderRadius: 8 }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                type="primary"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                style={{ borderRadius: 8 }}
              >
                Gerar
              </Button>
            </div>
          </Space>
        </Card>
      </Space>
    </Modal>
  );
};

export default GenerateDiagramModal;
