import { memo, useState } from "react";
import { Card, Row, Col, Button, Input } from "antd";
import { DeleteOutlined, KeyOutlined } from "@ant-design/icons";
import AttributesModal from "./AttributesModal";
import DeleteModal from "./DeleteModal";
import { Handle, Position, useReactFlow } from "reactflow";
import type { Field } from "../../types/diagramER";

interface Props {
  id: string;
  data: {
    fields?: Field[];
    name?: string;
  };
}

export default memo(function EntityNode({ id, data }: Props) {
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
        onConfirm={() =>
          setNodes((nds) => nds.filter((node) => node.id !== id))
        }
      />

      <AttributesModal
        open={open}
        setOpen={setOpen}
        fields={fields}
        setFields={updateFields}
      />

      <Card
        size="small"
        style={{ width: 240 }}
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
                borderBottom: "1px solid #595959",
                borderRadius: 0,
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

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </Card>
    </>
  );
});
