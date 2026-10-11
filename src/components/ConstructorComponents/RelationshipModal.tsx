import { useState } from "react";
import { Alert, Modal, Radio, Select, Space, Typography } from "antd";
import type { FkAction } from "../../types/diagramER";

const { Text } = Typography;

export type RelationshipDetails = {
  relationType: string;
  parentTable: string;
  childTable: string;
  fkColumn: string | null;
  isJunction: boolean;
  canChangeParticipation: boolean;
  required: boolean;
  onDelete: FkAction | null;
  onUpdate: FkAction | null;
};

export type RelationshipChanges = {
  onDelete: FkAction | null;
  onUpdate: FkAction | null;
  required: boolean;
};

interface Props {
  details: RelationshipDetails;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (changes: RelationshipChanges) => void;
}

const ACTION_OPTIONS: { value: FkAction | "DEFAULT"; label: string }[] = [
  { value: "DEFAULT", label: "Padrão (NO ACTION)" },
  { value: "RESTRICT", label: "RESTRICT: impede a operação" },
  { value: "CASCADE", label: "CASCADE: propaga para os filhos" },
  { value: "SET NULL", label: "SET NULL: limpa a chave estrangeira" },
  { value: "SET DEFAULT", label: "SET DEFAULT: só PostgreSQL" },
];

const toOption = (action: FkAction | null) => (action && action !== "NO ACTION" ? action : "DEFAULT");
const fromOption = (value: FkAction | "DEFAULT") => (value === "DEFAULT" ? null : value);

export default function RelationshipModal({ details, readOnly, onClose, onSave }: Props) {
  const [onDelete, setOnDelete] = useState<FkAction | null>(details.onDelete);
  const [onUpdate, setOnUpdate] = useState<FkAction | null>(details.onUpdate);
  const [required, setRequired] = useState(details.required);

  const setNullWithRequired = required && (onDelete === "SET NULL" || onUpdate === "SET NULL");
  const fkLabel = details.fkColumn ? `${details.childTable}.${details.fkColumn}` : details.childTable;

  return (
    <Modal
      open
      title="Editar relacionamento"
      okText="Salvar"
      cancelText="Cancelar"
      onCancel={onClose}
      onOk={() => {
        onSave({ onDelete, onUpdate, required });
        onClose();
      }}
      okButtonProps={{ disabled: readOnly || setNullWithRequired }}
      focusTriggerAfterClose={false}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Text>
          <b>{fkLabel}</b> referencia <b>{details.parentTable}</b>
          {details.isJunction ? " (tabela associativa de um N:N)" : ` (${details.relationType})`}
        </Text>

        <div>
          <Text strong style={{ display: "block", marginBottom: 6 }}>
            Participação de {details.childTable}
          </Text>
          <Radio.Group
            value={required ? "required" : "optional"}
            onChange={(e) => setRequired(e.target.value === "required")}
            disabled={readOnly || !details.canChangeParticipation}
          >
            <Space direction="vertical">
              <Radio value="required">
                Obrigatória: todo {details.childTable} precisa de um {details.parentTable} (FK NOT NULL)
              </Radio>
              <Radio value="optional">
                Opcional: {details.childTable} pode existir sem {details.parentTable} (FK aceita NULL)
              </Radio>
            </Space>
          </Radio.Group>
          {!details.canChangeParticipation && (
            <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
              {details.isJunction
                ? "Numa tabela associativa as chaves estrangeiras fazem parte da chave primária e são sempre obrigatórias."
                : "A coluna da chave estrangeira não foi encontrada ou faz parte da chave primária."}
            </Text>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
          <Text strong>ON DELETE</Text>
          <Select<FkAction | "DEFAULT">
            aria-label="ON DELETE"
            value={toOption(onDelete)}
            onChange={(value) => setOnDelete(fromOption(value))}
            options={ACTION_OPTIONS}
            disabled={readOnly}
          />
          <Text strong>ON UPDATE</Text>
          <Select<FkAction | "DEFAULT">
            aria-label="ON UPDATE"
            value={toOption(onUpdate)}
            onChange={(value) => setOnUpdate(fromOption(value))}
            options={ACTION_OPTIONS}
            disabled={readOnly}
          />
        </div>

        {setNullWithRequired && (
          <Alert
            type="error"
            showIcon
            message="SET NULL exige que a chave estrangeira aceite NULL. Torne a participação opcional ou escolha outra ação."
          />
        )}
      </Space>
    </Modal>
  );
}
