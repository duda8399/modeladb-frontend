import { Alert, Button, Drawer, Input, Space, Typography } from "antd";
import { RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  generating: boolean;
  readOnly: boolean;
  onGenerate: () => void;
}

export default function AiGenerateDrawer({
  open,
  onClose,
  prompt,
  onPromptChange,
  generating,
  readOnly,
  onGenerate,
}: Readonly<Props>) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={
        <Space>
          <RobotOutlined />
          Gerar com IA
        </Space>
      }
    >
      <Text type="secondary">
        Descreva o sistema, as entidades e as regras do negócio. A IA monta as tabelas, colunas e relacionamentos.
      </Text>
      <Input.TextArea
        aria-label="Descrição do banco de dados"
        placeholder="Ex.: uma biblioteca com livros, autores, leitores e empréstimos com data de devolução"
        autoSize={{ minRows: 6, maxRows: 14 }}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={generating || readOnly}
        style={{ marginTop: 12 }}
      />
      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 12 }}
        message="O diagrama atual será substituído pelo diagrama gerado."
      />
      <Button
        type="primary"
        icon={<ThunderboltOutlined />}
        loading={generating}
        disabled={readOnly}
        onClick={onGenerate}
        style={{ marginTop: 12, width: "100%", backgroundColor: readOnly ? undefined : "#2F7D32" }}
      >
        Gerar diagrama
      </Button>
    </Drawer>
  );
}
