import { useState } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, Input, Modal, Select, Space, Typography } from "antd";
import type { Field, TableIndex } from "../../types/diagramER";
import { defaultIndexName } from "../../utils/sqlExport";

const { Text } = Typography;

interface Props {
  onClose: () => void;
  tableName: string;
  fields: Field[];
  indexes: TableIndex[];
  onSave: (indexes: TableIndex[]) => void;
  readOnly?: boolean;
}

export default function IndexesModal({ onClose, tableName, fields, indexes, onSave, readOnly }: Props) {
  const [draft, setDraft] = useState<TableIndex[]>(() => {
    const fieldIds = new Set(fields.map((field) => field.id));
    return indexes.map((index) => ({ ...index, columns: index.columns.filter((id) => fieldIds.has(id)) }));
  });
  const [error, setError] = useState<string | null>(null);

  const namedFields = fields.filter((field) => field.name);
  const fieldName = (id: string) => namedFields.find((field) => field.id === id)?.name ?? "";

  const update = (id: string, patch: Partial<TableIndex>) =>
    setDraft((current) => current.map((index) => (index.id === id ? { ...index, ...patch } : index)));

  const addIndex = () =>
    setDraft((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", columns: [], unique: false },
    ]);

  const placeholderFor = (index: TableIndex) =>
    defaultIndexName(tableName, index.columns.map(fieldName).filter(Boolean)) || "nome_do_indice";

  const handleSave = () => {
    if (draft.some((index) => index.columns.length === 0)) {
      setError("Todo índice precisa de pelo menos uma coluna.");
      return;
    }

    const finalIndexes = draft.map((index) => ({
      ...index,
      name: index.name.trim() || placeholderFor(index),
    }));

    const names = finalIndexes.map((index) => index.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      setError("Já existe um índice com esse nome nesta tabela.");
      return;
    }

    onSave(finalIndexes);
    onClose();
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={`Índices de ${tableName || "Entidade"}`}
      width={720}
      okText="Salvar"
      cancelText="Cancelar"
      onOk={handleSave}
      okButtonProps={{ disabled: readOnly }}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      {draft.length === 0 ? (
        <Empty description="Nenhum índice nesta tabela" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 70px 32px", gap: 8 }}>
            <Text type="secondary">Nome</Text>
            <Text type="secondary">Colunas</Text>
            <Text type="secondary">Único</Text>
            <span />
          </div>
          {draft.map((index) => (
            <div
              key={index.id}
              data-testid="index-row"
              style={{ display: "grid", gridTemplateColumns: "200px 1fr 70px 32px", gap: 8, alignItems: "center" }}
            >
              <Input
                aria-label="Nome do índice"
                value={index.name}
                placeholder={placeholderFor(index)}
                onChange={(e) => update(index.id, { name: e.target.value })}
                disabled={readOnly}
              />
              <Select
                aria-label="Colunas do índice"
                mode="multiple"
                value={index.columns}
                placeholder="Selecione as colunas"
                onChange={(columns: string[]) => update(index.id, { columns })}
                options={namedFields.map((field) => ({ value: field.id, label: field.name }))}
                disabled={readOnly}
                style={{ width: "100%" }}
              />
              <Checkbox
                aria-label="Índice único"
                checked={index.unique}
                onChange={(e) => update(index.id, { unique: e.target.checked })}
                disabled={readOnly}
              />
              <Button
                aria-label="Remover índice"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDraft((current) => current.filter((i) => i.id !== index.id))}
                disabled={readOnly}
              />
            </div>
          ))}
        </Space>
      )}

      <Button
        icon={<PlusOutlined />}
        onClick={addIndex}
        disabled={readOnly || namedFields.length === 0}
        style={{ marginTop: 16 }}
      >
        Adicionar índice
      </Button>
      {namedFields.length === 0 && (
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Crie atributos na tabela antes de adicionar índices.
        </Text>
      )}
    </Modal>
  );
}
