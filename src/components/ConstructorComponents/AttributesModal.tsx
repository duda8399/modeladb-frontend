import { useState } from "react";
import { DeleteOutlined, HolderOutlined } from "@ant-design/icons";
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
import type { Field } from "../../types/diagramER";
import { PkIcon, FkIcon } from "./FieldIcons";

const { Title, Text } = Typography;

const toOptions = (types: string[]) =>
  types.map((value) => ({ value, label: value }));

// Tipos de dados do MySQL agrupados por categoria (padrao MySQL Workbench)
const TYPE_OPTIONS = [
  {
    label: "Numericos",
    options: toOptions([
      "TINYINT",
      "SMALLINT",
      "MEDIUMINT",
      "INT",
      "BIGINT",
      "DECIMAL",
      "FLOAT",
      "DOUBLE",
      "BIT",
    ]),
  },
  {
    label: "Data e Hora",
    options: toOptions(["DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR"]),
  },
  {
    label: "Texto",
    options: toOptions([
      "CHAR",
      "VARCHAR",
      "TINYTEXT",
      "TEXT",
      "MEDIUMTEXT",
      "LONGTEXT",
      "ENUM",
      "SET",
    ]),
  },
  {
    label: "Binarios",
    options: toOptions([
      "BINARY",
      "VARBINARY",
      "TINYBLOB",
      "BLOB",
      "MEDIUMBLOB",
      "LONGBLOB",
    ]),
  },
  {
    label: "Outros",
    options: toOptions(["BOOLEAN", "JSON", "GEOMETRY", "POINT"]),
  },
];

interface Props {
  open: boolean;
  setOpen: (state: boolean) => void;
  fields: Field[];
  setFields: (fields: Field[]) => void;
}

export default function Attributes({
  open,
  setOpen,
  fields,
  setFields,
}: Readonly<Props>) {

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Reordena os atributos via drag-and-drop (handle de cada linha)
  const handleDrop = (dropIndex: number) => {
    if (dragIndex !== null && dragIndex !== dropIndex) {
      const updated = [...fields];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(dropIndex, 0, moved);
      setFields(updated);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const addField = () => {
    const newField: Field =
      fields.length === 0
        ? {
            id: crypto.randomUUID(),
            name: "id",
            type: "INT",
            pk: true,
            fk: false,
            notNull: true,
            unique: true,
            ai: true,
          }
        : {
            id: crypto.randomUUID(),
            name: null,
            type: null,
            pk: false,
            fk: false,
            notNull: false,
            unique: false,
            ai: false,
          };

    setFields([...fields, newField]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((field) => field.id !== id));
  };

  const updateField = (id: string, key: keyof Field, value: any) => {
    setFields(
      fields.map((field) =>
        field.id === id ? { ...field, [key]: value } : field,
      ),
    );
  };

  // Ao marcar PK, Not Null e Unique sao marcados automaticamente
  const handlePkChange = (id: string, checked: boolean) => {
    setFields(
      fields.map((field) =>
        field.id === id
          ? checked
            ? { ...field, pk: true, notNull: true, unique: true }
            : { ...field, pk: false }
          : field,
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
      <Space
        direction="vertical"
        size="middle"
        style={{ width: "100%", paddingRight: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", paddingTop: 8 }}>
          <div style={{ width: 24, flexShrink: 0 }} />
          <Row gutter={16} align="middle" style={{ flex: 1 }}>
            <Col span={5}>
              <Text strong>Coluna</Text>
            </Col>

          <Col span={4}>
            <Text strong>Tipo</Text>
          </Col>

          <Col span={3} style={{ textAlign: "center" }}>
            <Text strong>Primary Key</Text>
          </Col>

          <Col span={3} style={{ textAlign: "center" }}>
            <Text strong>Foreign Key</Text>
          </Col>

          <Col span={3} style={{ textAlign: "center" }}>
            <Text strong>Auto Increment</Text>
          </Col>

          <Col span={3} style={{ textAlign: "center" }}>
            <Text strong>Not Null</Text>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Text strong>Unique</Text>
          </Col>

            <Col span={1} />
          </Row>
        </div>

        <Divider style={{ margin: "1px 0" }} />

        {fields.map((field, index) => (
          <div
            key={field.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={() => handleDrop(index)}
            style={{
              display: "flex",
              alignItems: "center",
              opacity: dragIndex === index ? 0.4 : 1,
              borderTop:
                overIndex === index && dragIndex !== index
                  ? "2px solid #2f7d32"
                  : "2px solid transparent",
              borderRadius: 4,
            }}
          >
            <div
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              style={{
                width: 24,
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
                cursor: "grab",
                color: "#bfbfbf",
              }}
            >
              <HolderOutlined />
            </div>
            <Row gutter={16} align="middle" style={{ flex: 1 }}>
            <Col span={5}>
              <Input
                placeholder="Nome da coluna"
                value={field.name ?? ""}
                prefix={
                  field.pk ? (
                    <PkIcon />
                  ) : field.fk ? (
                    <FkIcon />
                  ) : (
                    <span style={{ display: "inline-block", width: 11 }} />
                  )
                }
                onChange={(e: any) =>
                  updateField(field.id, "name", e.target.value)
                }
              />
            </Col>

            <Col span={4}>
              <Select
                value={field.type ?? undefined}
                style={{ width: "100%" }}
                placeholder="Tipo"
                showSearch
                optionFilterProp="label"
                onChange={(value) => updateField(field.id, "type", value)}
                options={TYPE_OPTIONS}
              />
            </Col>

            <Col span={3} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.pk}
                onChange={(e) => handlePkChange(field.id, e.target.checked)}
              />
            </Col>

            <Col span={3} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.fk}
                onChange={(e) => updateField(field.id, "fk", e.target.checked)}
              />
            </Col>

            <Col span={3} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.ai}
                onChange={(e) => updateField(field.id, "ai", e.target.checked)}
              />
            </Col>

            <Col span={3} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.notNull}
                onChange={(e) =>
                  updateField(field.id, "notNull", e.target.checked)
                }
              />
            </Col>

            <Col span={2} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.unique}
                onChange={(e) =>
                  updateField(field.id, "unique", e.target.checked)
                }
              />
            </Col>

            <Col span={1}>
              <Tooltip title="Remover atributo">
                <Button
                  style={{
                    backgroundColor: "#B11226",
                    border: "none",
                    color: "#FFF",
                  }}
                  shape="circle"
                  icon={<DeleteOutlined />}
                  onClick={() => removeField(field.id)}
                />
              </Tooltip>
            </Col>
            </Row>
          </div>
        ))}

        <div
          style={{
            paddingTop: 16,
            paddingBottom: 20,
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Button
            type="dashed"
            style={{ fontWeight: "bold", fontSize: "12pt" }}
            block
            onClick={addField}
          >
            + Adicionar atributo
          </Button>
        </div>
      </Space>
    </Modal>
  );
}
