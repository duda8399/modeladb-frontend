import { useEffect, useState } from "react";
import { CloseOutlined, FileTextOutlined, HolderOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Col,
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
import {
  isSizedType,
  isValidSize,
  isValueListType,
  normalizeSize,
  normalizeValues,
  sizePlaceholder,
} from "../../utils/sqlTypes";

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
  tableName?: string;
  tableDescription?: string | null;
  onTableDescriptionChange?: (description: string | null) => void;
}

// Mantem o valor digitado em estado local ate o blur, para nao disparar um
// op de colaboracao (e o consequente reset do value controlado) a cada tecla,
// o que interrompe a composicao de acentos via dead-key (~, ^, ´) no meio da digitacao.
function NameCell({
  field,
  onCommit,
}: {
  field: Field;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(field.name ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setValue(field.name ?? "");
  }, [field.name, editing]);

  return (
    <Input
      placeholder="Nome da coluna"
      value={value}
      prefix={
        field.pk ? (
          <PkIcon />
        ) : field.fk ? (
          <FkIcon />
        ) : (
          <span style={{ display: "inline-block", width: 11 }} />
        )
      }
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (value !== (field.name ?? "")) onCommit(value);
      }}
      onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
    />
  );
}

function CommitCell({
  value: committed,
  placeholder,
  disabled,
  ariaLabel,
  validate,
  invalidMessage,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  validate?: (value: string) => boolean;
  invalidMessage?: string;
  onCommit: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(committed);
  const [editing, setEditing] = useState(false);
  const value = editing ? draft : committed;
  const invalid = !!validate && !validate(value);

  return (
    <Tooltip title={invalid ? invalidMessage : undefined} open={invalid && editing ? true : undefined}>
      <Input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        status={invalid ? "error" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          setDraft(committed);
          setEditing(true);
        }}
        onBlur={() => {
          setEditing(false);
          const next = draft.trim();
          if (validate && !validate(next)) return;
          if (next !== committed) onCommit(next || null);
        }}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
    </Tooltip>
  );
}

export default function Attributes({
  open,
  setOpen,
  fields,
  setFields,
  tableName,
  tableDescription,
  onTableDescriptionChange,
}: Readonly<Props>) {
  const [descriptionToggles, setDescriptionToggles] = useState<Record<string, boolean>>({});

  const isDescriptionOpen = (field: Field) => descriptionToggles[field.id] ?? !!field.description;

  const toggleDescription = (field: Field) =>
    setDescriptionToggles((current) => ({ ...current, [field.id]: !isDescriptionOpen(field) }));

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

  const changeType = (id: string, type: string) => {
    setFields(
      fields.map((field) =>
        field.id === id
          ? {
              ...field,
              type,
              size: isValidSize(type, field.size) ? field.size ?? null : null,
              values: isValueListType(type) ? normalizeValues(field.values, type) : null,
            }
          : field,
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
      width={1120}
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
          Configurar atributos{tableName?.trim() ? ` - Tabela ${tableName.trim()}` : ""}
        </Title>
      }
    >
      <Space
        direction="vertical"
        size="middle"
        style={{ width: "100%", paddingRight: 24 }}
      >
        {onTableDescriptionChange && (
          <div>
            <Text strong>Descrição da tabela</Text>
            <div style={{ marginTop: 6 }}>
              <CommitCell
                ariaLabel="Descrição da tabela"
                value={tableDescription ?? ""}
                placeholder="Para que serve esta tabela (exportada como COMMENT)"
                onCommit={onTableDescriptionChange}
              />
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 8px",
            background: "#E8F5E9",
            borderRadius: 6,
            borderBottom: "2px solid #2F7D32",
          }}
        >
          <div style={{ width: 24, flexShrink: 0 }} />
          <Row gutter={16} align="middle" style={{ flex: 1 }}>
            <Col span={4}>
              <Text strong>Coluna</Text>
            </Col>

          <Col span={3}>
            <Text strong>Tipo</Text>
          </Col>

          <Col span={3}>
            <Tooltip title="Tamanho (VARCHAR, CHAR, BINARY), precisão e escala (DECIMAL), frações de segundo (DATETIME, TIMESTAMP, TIME) ou a lista de valores (ENUM, SET)">
              <Text strong>Tamanho / valores</Text>
            </Tooltip>
          </Col>

          <Col span={2}>
            <Tooltip title="Valor padrão em SQL, ex.: 0, 'ativo', CURRENT_TIMESTAMP">
              <Text strong>Padrão</Text>
            </Tooltip>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Tooltip title="Primary Key">
              <Text strong>PK</Text>
            </Tooltip>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Tooltip title="Foreign Key">
              <Text strong>FK</Text>
            </Tooltip>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Tooltip title="Auto Increment">
              <Text strong>AI</Text>
            </Tooltip>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Text strong>Not Null</Text>
          </Col>

          <Col span={2} style={{ textAlign: "center" }}>
            <Text strong>Unique</Text>
          </Col>

            <Col span={2} />
          </Row>
        </div>

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
            <Col span={4}>
              <NameCell
                field={field}
                onCommit={(value) => updateField(field.id, "name", value)}
              />
            </Col>

            <Col span={3}>
              <Select
                value={field.type ?? undefined}
                style={{ width: "100%" }}
                placeholder="Tipo"
                showSearch
                optionFilterProp="label"
                onChange={(value) => changeType(field.id, value)}
                options={TYPE_OPTIONS}
              />
            </Col>

            <Col span={3}>
              {isValueListType(field.type) ? (
                <Select
                  aria-label="Valores permitidos"
                  mode="tags"
                  style={{ width: "100%" }}
                  value={normalizeValues(field.values, field.type)}
                  placeholder="Digite e tecle Enter"
                  tokenSeparators={[","]}
                  maxTagCount="responsive"
                  suffixIcon={null}
                  status={normalizeValues(field.values, field.type).length ? undefined : "error"}
                  onChange={(values: string[]) =>
                    updateField(field.id, "values", normalizeValues(values, field.type))
                  }
                />
              ) : (
              <CommitCell
                ariaLabel="Tamanho"
                value={field.size ?? ""}
                placeholder={sizePlaceholder(field.type)}
                disabled={!isSizedType(field.type)}
                validate={(value) => isValidSize(field.type, value)}
                invalidMessage={
                  field.type?.toUpperCase() === "DECIMAL"
                    ? "Use precisão ou precisão,escala, ex.: 10,2"
                    : "Valor inválido para este tipo"
                }
                onCommit={(value) => updateField(field.id, "size", value ? normalizeSize(value) : null)}
              />
              )}
            </Col>

            <Col span={2}>
              <CommitCell
                ariaLabel="Valor padrão"
                value={field.defaultValue ?? ""}
                placeholder={field.ai ? "auto" : "—"}
                disabled={field.ai}
                onCommit={(value) => updateField(field.id, "defaultValue", value)}
              />
            </Col>

            <Col span={2} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.pk}
                onChange={(e) => handlePkChange(field.id, e.target.checked)}
              />
            </Col>

            <Col span={2} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.fk}
                onChange={(e) => updateField(field.id, "fk", e.target.checked)}
              />
            </Col>

            <Col span={2} style={{ textAlign: "center" }}>
              <Checkbox
                className="attr-checkbox"
                checked={field.ai}
                onChange={(e) => updateField(field.id, "ai", e.target.checked)}
              />
            </Col>

            <Col span={2} style={{ textAlign: "center" }}>
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

            <Col span={2} style={{ display: "flex" }}>
              <Tooltip title={field.description ? "Editar descrição" : "Adicionar descrição"}>
                <Button
                  type="text"
                  aria-label="Descrição da coluna"
                  aria-pressed={isDescriptionOpen(field)}
                  style={{ color: field.description ? "#2F7D32" : "#8c8c8c", border: "none" }}
                  icon={<FileTextOutlined />}
                  onClick={() => toggleDescription(field)}
                />
              </Tooltip>
              <Tooltip title="Remover atributo">
                <Button
                  type="text"
                  style={{ color: "#B11226", border: "none" }}
                  icon={<CloseOutlined />}
                  onClick={() => removeField(field.id)}
                />
              </Tooltip>
            </Col>
            {isDescriptionOpen(field) && (
              <Col span={24} style={{ marginTop: 6 }}>
                <CommitCell
                  ariaLabel={`Descrição de ${field.name || "coluna"}`}
                  value={field.description ?? ""}
                  placeholder="Descrição da coluna (exportada como COMMENT)"
                  onCommit={(value) => updateField(field.id, "description", value)}
                />
              </Col>
            )}
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
