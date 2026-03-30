import { DeleteOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Col,
  Divider,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { useRef } from "react";

const { Title, Text } = Typography;

interface Props {
  open: boolean;
  setOpen: (state: boolean) => void;
  fields: Field[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
}

interface Field {
  id: number;
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  ai: boolean;
}

export default function Attributes({
  open,
  setOpen,
  fields,
  setFields,
}: Readonly<Props>) {
  const initialId = useRef(1);

  const generateId = () => initialId.current++;

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: generateId(),
        name: "",
        type: "VARCHAR",
        pk: false,
        notNull: false,
        unique: false,
        ai: false,
      },
    ]);
  };

  const removeField = (id: number) => {
    setFields((prev) => prev.filter((field) => field.id !== id));
  };

  const updateField = (id: number, key: keyof Field, value: any) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === id ? { ...field, [key]: value } : field,
      ),
    );
  };

  return (
    <Modal
      width={900}
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <>
          <Button key="ok" type="default" onClick={() => setOpen(false)}>
            Descartar alterações
          </Button>
          <Button key="ok" type="primary" onClick={() => setOpen(false)}>
            Salvar
          </Button>
        </>,
      ]}
      title={
        <Title
          level={4}
          style={{
            margin: 0,
            paddingBottom: 16,
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          Configurar atributos
        </Title>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Row gutter={16} style={{ paddingTop: 8 }} align="middle">
          <Col span={7}>
            <Text strong>Coluna</Text>
          </Col>

          <Col span={7}>
            <Text strong>Tipo</Text>
          </Col>

          <Col span={2}>
            <Text strong>PK</Text>
          </Col>

          <Col span={2}>
            <Text strong>AI</Text>
          </Col>

          <Col span={2}>
            <Text strong>Not Null</Text>
          </Col>

          <Col span={2}>
            <Text strong>Unique</Text>
          </Col>

          <Col span={1} />
        </Row>

        <Divider style={{ margin: "1px 0" }} />

        {fields.map((field) => (
          <Row key={field.id} gutter={16} align="middle">
            <Col span={7}>
              <Input
                placeholder="Nome da coluna"
                value={field.name}
                onChange={(e) => updateField(field.id, "name", e.target.value)}
              />
            </Col>

            <Col span={7}>
              <Select
                value={field.type}
                style={{ width: "100%" }}
                onChange={(value) => updateField(field.id, "type", value)}
                options={[
                  { value: "INT", label: "INT" },
                  { value: "VARCHAR", label: "VARCHAR" },
                  { value: "TEXT", label: "TEXT" },
                  { value: "BOOLEAN", label: "BOOLEAN" },
                  { value: "DATE", label: "DATE" },
                ]}
              />
            </Col>

            <Col span={2}>
              <Checkbox
                checked={field.pk}
                onChange={(e) => updateField(field.id, "pk", e.target.checked)}
              />
            </Col>

            <Col span={2}>
              <Checkbox
                checked={field.ai}
                onChange={(e) => updateField(field.id, "ai", e.target.checked)}
              />
            </Col>

            <Col span={2}>
              <Checkbox
                checked={field.notNull}
                onChange={(e) =>
                  updateField(field.id, "notNull", e.target.checked)
                }
              />
            </Col>

            <Col span={2}>
              <Checkbox
                checked={field.unique}
                onChange={(e) =>
                  updateField(field.id, "unique", e.target.checked)
                }
              />
            </Col>

            <Col span={1}>
              <Tooltip title="Remover atributo">
                <Button
                  style={{backgroundColor: '#B11226', border: 'none', color: '#FFF'}}
                  shape="circle"
                  icon={<DeleteOutlined />}
                  onClick={() => removeField(field.id)}
                />
              </Tooltip>
            </Col>
          </Row>
        ))}

        <div
          style={{
            paddingTop: 16,
            paddingBottom: 20,
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Button type="dashed" style={{fontWeight: 'bold', fontSize: '12pt'}} block onClick={addField}>
            + Adicionar atributo
          </Button>
        </div>
      </Space>
    </Modal>
  );
}
