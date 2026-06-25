import { memo, useState } from "react";
import { Card, Row, Col, Button, Input } from "antd";
import { DeleteOutlined, KeyOutlined } from "@ant-design/icons";
import AttributesModal from "./AttributesModal";
import DeleteModal from "./DeleteModal";
import { Handle, Position, useReactFlow } from "reactflow";
import type { Field } from "../../types/diagramER";
import { FkIcon } from "./FieldIcons";

interface Props {
  id: string;
  data: {
    fields?: Field[];
    name?: string;
  };
  onBeforeDelete?: () => void;
}

export default memo(function EntityNode({ id, data, onBeforeDelete }: Props) {
  const { setNodes } = useReactFlow();
  const fields = data.fields || [];
  const [open, setOpen] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [entityName, setEntityName] = useState((data as any).name || "Entidade");

  const updateFields = (newFields: Field[]) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              fields: newFields,
            },
          };
        }
        return node;
      }),
    );
  };

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
        onConfirm={() => {
          onBeforeDelete?.();
          setNodes((nds) => nds.filter((node) => node.id !== id));
        }}
      />

      <AttributesModal
        open={open}
        setOpen={setOpen}
        fields={fields}
        setFields={updateFields}
      />

      <Card
        size="small"
        style={{ width: 300 }}
        styles={{
          header: {
            background: "#d9d9d9",
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
              onChange={(e: any) => {
                const value = e.target.value;
                setEntityName(value);
                setNodes((nds) =>
                  nds.map((node) => {
                    if (node.id === id) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          name: value,
                        },
                      };
                    }
                    return node;
                  }),
                );
              }}
              size="small"
              style={{
                fontWeight: "bold",
                padding: 0,
                background: "transparent",
                color: "#333333",
                border: "none",
                borderRadius: 0,
                textAlign: "center",
              }}
            />

            <DeleteOutlined
              style={{ cursor: "pointer", color: "#B11226" }}
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
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {field.pk && <KeyOutlined style={{ color: "#faad14" }} />}
                {field.fk && <FkIcon />}
                <span>{field.name || "-"}</span>
              </div>
            </Col>

            <Col span={12} style={{ padding: "6px 8px" }}>
              {field.type}
            </Col>
          </Row>
        ))}

        <div
          style={{
            borderTop: "1px solid #f0f0f0",
            padding: 6,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Button
            type="text"
            style={{ background: "#2F7D32", color: "#FFF", width: "100%" }}
            onClick={() => setOpen(true)}
          >
            Configurar atributos
          </Button>
        </div>

        {/* Em ConnectionMode.Loose qualquer handle pode iniciar ou receber
            uma conexao, entao o lado de onde voce arrasta (1o clique) vira o
            source e onde voce solta (2o clique) vira o target. Assim a direcao
            da FK segue a ordem do clique, e nao a posicao das tabelas. */}
        <Handle
          type="source"
          id="left"
          position={Position.Left}
          className="entity-handle"
          style={{ left: -9 }}
        />
        <Handle
          type="source"
          id="right"
          position={Position.Right}
          className="entity-handle"
          style={{ right: -9 }}
        />
      </Card>
    </>
  );
});
