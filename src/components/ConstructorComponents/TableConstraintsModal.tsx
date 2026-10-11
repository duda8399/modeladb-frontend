import { useState } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Empty, Input, Modal, Select, Space, Tabs, Typography } from "antd";
import type { Field, TableCheck, TableIndex } from "../../types/diagramER";
import { defaultCheckName, defaultIndexName } from "../../utils/sqlExport";

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  tableName: string;
  fields: Field[];
  indexes: TableIndex[];
  checks: TableCheck[];
  initialTab?: "indexes" | "checks";
  onSave: (indexes: TableIndex[], checks: TableCheck[]) => void;
}

const INDEX_GRID = "200px 1fr 70px 32px";
const CHECK_GRID = "200px 1fr 32px";

export default function TableConstraintsModal({
  open,
  onClose,
  tableName,
  fields,
  indexes,
  checks,
  initialTab = "indexes",
  onSave,
}: Props) {
  const [indexDraft, setIndexDraft] = useState<TableIndex[]>(() => {
    const fieldIds = new Set(fields.map((field) => field.id));
    return indexes.map((index) => ({ ...index, columns: index.columns.filter((id) => fieldIds.has(id)) }));
  });
  const [checkDraft, setCheckDraft] = useState<TableCheck[]>(() => checks.map((check) => ({ ...check })));
  const [tab, setTab] = useState<string>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const namedFields = fields.filter((field) => field.name);
  const fieldName = (id: string) => namedFields.find((field) => field.id === id)?.name ?? "";

  const updateIndex = (id: string, patch: Partial<TableIndex>) =>
    setIndexDraft((current) => current.map((index) => (index.id === id ? { ...index, ...patch } : index)));

  const updateCheck = (id: string, patch: Partial<TableCheck>) =>
    setCheckDraft((current) => current.map((check) => (check.id === id ? { ...check, ...patch } : check)));

  const indexPlaceholder = (index: TableIndex) =>
    defaultIndexName(tableName, index.columns.map(fieldName).filter(Boolean)) || "nome_do_indice";

  const handleSave = () => {
    if (indexDraft.some((index) => index.columns.length === 0)) {
      setTab("indexes");
      setError("Todo índice precisa de pelo menos uma coluna.");
      return;
    }
    if (checkDraft.some((check) => !check.expression.trim())) {
      setTab("checks");
      setError("Toda restrição CHECK precisa de uma condição.");
      return;
    }

    const finalIndexes = indexDraft.map((index) => ({
      ...index,
      name: index.name.trim() || indexPlaceholder(index),
    }));
    const finalChecks = checkDraft.map((check, position) => ({
      ...check,
      name: check.name.trim() || defaultCheckName(tableName, position),
      expression: check.expression.trim(),
    }));

    const indexNames = finalIndexes.map((index) => index.name.toLowerCase());
    if (new Set(indexNames).size !== indexNames.length) {
      setTab("indexes");
      setError("Já existe um índice com esse nome nesta tabela.");
      return;
    }
    const checkNames = finalChecks.map((check) => check.name.toLowerCase());
    if (new Set(checkNames).size !== checkNames.length) {
      setTab("checks");
      setError("Já existe uma restrição CHECK com esse nome nesta tabela.");
      return;
    }

    onSave(finalIndexes, finalChecks);
    onClose();
  };

  const indexesTab = (
    <>
      {indexDraft.length === 0 ? (
        <Empty description="Nenhum índice nesta tabela" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <div style={{ display: "grid", gridTemplateColumns: INDEX_GRID, gap: 8 }}>
            <Text type="secondary">Nome</Text>
            <Text type="secondary">Colunas</Text>
            <Text type="secondary">Único</Text>
            <span />
          </div>
          {indexDraft.map((index) => (
            <div
              key={index.id}
              data-testid="index-row"
              style={{ display: "grid", gridTemplateColumns: INDEX_GRID, gap: 8, alignItems: "center" }}
            >
              <Input
                aria-label="Nome do índice"
                value={index.name}
                placeholder={indexPlaceholder(index)}
                onChange={(e) => updateIndex(index.id, { name: e.target.value })}
              />
              <Select
                aria-label="Colunas do índice"
                mode="multiple"
                value={index.columns}
                placeholder="Selecione as colunas"
                onChange={(columns: string[]) => updateIndex(index.id, { columns })}
                options={namedFields.map((field) => ({ value: field.id, label: field.name }))}
                style={{ width: "100%" }}
              />
              <Checkbox
                aria-label="Índice único"
                checked={index.unique}
                onChange={(e) => updateIndex(index.id, { unique: e.target.checked })}
              />
              <Button
                aria-label="Remover índice"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setIndexDraft((current) => current.filter((i) => i.id !== index.id))}
              />
            </div>
          ))}
        </Space>
      )}

      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          setIndexDraft((current) => [...current, { id: crypto.randomUUID(), name: "", columns: [], unique: false }])
        }
        disabled={namedFields.length === 0}
        style={{ marginTop: 16 }}
      >
        Adicionar índice
      </Button>
      {namedFields.length === 0 && (
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Crie atributos na tabela antes de adicionar índices.
        </Text>
      )}
    </>
  );

  const checksTab = (
    <>
      <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        Condição que toda linha precisa satisfazer, escrita em SQL. Ex.: preco &gt;= 0, fim &gt; inicio,
        status IN (&apos;ativo&apos;, &apos;inativo&apos;).
      </Text>
      {checkDraft.length === 0 ? (
        <Empty description="Nenhuma restrição CHECK nesta tabela" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <div style={{ display: "grid", gridTemplateColumns: CHECK_GRID, gap: 8 }}>
            <Text type="secondary">Nome</Text>
            <Text type="secondary">Condição</Text>
            <span />
          </div>
          {checkDraft.map((check, position) => (
            <div
              key={check.id}
              data-testid="check-row"
              style={{ display: "grid", gridTemplateColumns: CHECK_GRID, gap: 8, alignItems: "center" }}
            >
              <Input
                aria-label="Nome da restrição"
                value={check.name}
                placeholder={defaultCheckName(tableName, position)}
                onChange={(e) => updateCheck(check.id, { name: e.target.value })}
              />
              <Input
                aria-label="Condição"
                value={check.expression}
                placeholder="coluna >= 0"
                status={check.expression.trim() ? undefined : "warning"}
                onChange={(e) => updateCheck(check.id, { expression: e.target.value })}
                style={{ fontFamily: "monospace" }}
              />
              <Button
                aria-label="Remover restrição"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setCheckDraft((current) => current.filter((c) => c.id !== check.id))}
              />
            </div>
          ))}
        </Space>
      )}

      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          setCheckDraft((current) => [...current, { id: crypto.randomUUID(), name: "", expression: "" }])
        }
        style={{ marginTop: 16 }}
      >
        Adicionar CHECK
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Índices e restrições de ${tableName || "Entidade"}`}
      width={760}
      okText="Salvar"
      cancelText="Cancelar"
      onOk={handleSave}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "indexes", label: `Índices (${indexDraft.length})`, children: indexesTab },
          { key: "checks", label: `CHECK (${checkDraft.length})`, children: checksTab },
        ]}
      />
    </Modal>
  );
}
