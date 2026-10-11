import { memo, useEffect, useState } from "react";
import { Card, Row, Col, Button, Input } from "antd";
import { CheckCircleOutlined, CloseOutlined, KeyOutlined, ThunderboltOutlined } from "@ant-design/icons";
import AttributesModal from "./AttributesModal";
import TableConstraintsModal from "./TableConstraintsModal";
import { formatTypeWithSize } from "../../utils/sqlTypes";
import DeleteModal from "./DeleteModal";
import { Handle, Position } from "reactflow";
import type { Field, TableCheck, TableIndex } from "../../types/diagramER";
import { FkIcon } from "./FieldIcons";

interface Props {
  id: string;
  data: {
    fields?: Field[];
    name?: string;
    indexes?: TableIndex[];
    checks?: TableCheck[];
  };
  onDelete?: () => void;
  onRename?: (value: string) => void;
  onFieldsChange?: (fields: Field[]) => void;
  onIndexesChange?: (indexes: TableIndex[]) => void;
  onChecksChange?: (checks: TableCheck[]) => void;
}

export default memo(function EntityNode({
  data,
  onDelete,
  onRename,
  onFieldsChange,
  onIndexesChange,
  onChecksChange,
}: Props) {
  const fields = data.fields || [];
  const indexes = data.indexes || [];
  const checks = data.checks || [];
  const fieldNameById = new Map(fields.map((field) => [field.id, field.name]));
  const visibleIndexes = indexes
    .map((index) => ({
      ...index,
      columnNames: index.columns.map((id) => fieldNameById.get(id)).filter(Boolean) as string[],
    }))
    .filter((index) => index.columnNames.length > 0);
  const [open, setOpen] = useState(false);
  const [openIndexes, setOpenIndexes] = useState(false);
  const [constraintsSession, setConstraintsSession] = useState(0);
  const [openDelete, setOpenDelete] = useState(false);
  const [entityName, setEntityName] = useState(data.name || "Entidade");
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (!isEditingName) {
      setEntityName(data.name || "Entidade");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.name]);

  return (
    <>
      <DeleteModal
        open={openDelete}
        setOpen={setOpenDelete}
        description={
          <span>
            Tem certeza que deseja excluir a entidade <b>{entityName}</b>?
          </span>
        }
        onConfirm={() => onDelete?.()}
      />

      <AttributesModal
        open={open}
        setOpen={setOpen}
        fields={fields}
        setFields={(newFields) => onFieldsChange?.(newFields)}
      />

      <TableConstraintsModal
          key={constraintsSession}
          open={openIndexes}
          onClose={() => setOpenIndexes(false)}
          tableName={entityName}
          fields={fields}
          indexes={indexes}
          checks={checks}
          onSave={(newIndexes, newChecks) => {
            if (JSON.stringify(newIndexes) !== JSON.stringify(indexes)) onIndexesChange?.(newIndexes);
            if (JSON.stringify(newChecks) !== JSON.stringify(checks)) onChecksChange?.(newChecks);
          }}
        />

      <Card
        size="small"
        style={{ width: 300 }}
        styles={{
          header: {
            background: "#2F7D32",
            padding: "6px 10px",
          },
          body: { padding: 0 },
        }}
        title={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Input
              value={entityName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEntityName(e.target.value)
              }
              onFocus={() => setIsEditingName(true)}
              onBlur={() => {
                setIsEditingName(false);
                onRename?.(entityName);
              }}
              onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
              size="small"
              style={{
                fontWeight: "bold",
                padding: 0,
                background: "transparent",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 0,
                textAlign: "center",
              }}
            />

            <CloseOutlined
              style={{ cursor: "pointer", color: "#FFFFFF" }}
              onClick={() => setOpenDelete(true)}
            />
          </div>
        }
      >
        {fields.map((field) => (
          <Row
            key={field.id}
            align="middle"
            style={{ borderTop: "1px solid #f0f0f0" }}
          >
            <Col
              span={12}
              style={{
                padding: "6px 8px",
                borderRight: "1px solid #f0f0f0",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                {field.pk && <KeyOutlined style={{ color: "#faad14" }} />}
                {field.fk && <FkIcon />}
                <span
                  title={field.name || "-"}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {field.name || "-"}
                </span>
              </div>
            </Col>

            <Col
              span={12}
              style={{
                padding: "6px 8px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={
                [formatTypeWithSize(field.type, field.size), field.defaultValue && `DEFAULT ${field.defaultValue}`]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            >
              {formatTypeWithSize(field.type, field.size)}
            </Col>
          </Row>
        ))}

        {visibleIndexes.length > 0 && (
          <div
            data-testid="entity-indexes"
            style={{ borderTop: "1px solid #e0e0e0", background: "#fafafa", padding: "4px 8px" }}
          >
            {visibleIndexes.map((index) => (
              <div
                key={index.id}
                title={`${index.unique ? "UNIQUE " : ""}INDEX ${index.name} (${index.columnNames.join(", ")})`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#555555",
                  padding: "2px 0",
                  minWidth: 0,
                }}
              >
                <ThunderboltOutlined style={{ color: "#1677ff" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {index.name} ({index.columnNames.join(", ")})
                </span>
                {index.unique && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#1677ff",
                      border: "1px solid #91caff",
                      borderRadius: 4,
                      padding: "0 4px",
                    }}
                  >
                    ÚNICO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {checks.length > 0 && (
          <div
            data-testid="entity-checks"
            style={{ borderTop: "1px solid #e0e0e0", background: "#fafafa", padding: "4px 8px" }}
          >
            {checks.map((check) => (
              <div
                key={check.id}
                title={`CONSTRAINT ${check.name} CHECK (${check.expression})`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#555555",
                  padding: "2px 0",
                  minWidth: 0,
                }}
              >
                <CheckCircleOutlined style={{ color: "#2F7D32" }} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    fontFamily: "monospace",
                  }}
                >
                  {check.expression}
                </span>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            borderTop: "1px solid #f0f0f0",
            padding: 6,
            display: "flex",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Button
            type="text"
            style={{ background: "#d9d9d9", color: "#333333", flex: 1 }}
            onClick={() => setOpen(true)}
          >
            Configurar atributos
          </Button>
          <Button
            type="text"
            icon={<ThunderboltOutlined />}
            style={{ background: "#d9d9d9", color: "#333333" }}
            onClick={() => {
              setConstraintsSession((session) => session + 1);
              setOpenIndexes(true);
            }}
          >
            Restrições
          </Button>
        </div>

        {/* Em ConnectionMode.Loose qualquer handle pode iniciar ou receber
            uma conexao, entao o lado de onde voce arrasta (1o clique) vira o
            source e onde voce solta (2o clique) vira o target. Assim a direcao
            da FK segue a ordem do clique, e nao a posicao das tabelas. */}
        {/* Pontos de conexao visiveis nas laterais da tabela. Com floating
            edges o ponto exato do handle nao importa para o desenho da linha,
            ele serve so para iniciar/receber a conexao. */}
        {[Position.Left, Position.Right].map(
          (pos) => (
            <Handle
              key={pos}
              type="source"
              id={pos}
              position={pos}
              className="entity-handle"
            />
          ),
        )}
      </Card>
    </>
  );
});
