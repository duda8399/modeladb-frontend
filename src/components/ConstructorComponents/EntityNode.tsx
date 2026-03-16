import { memo, useState } from "react";
import { Card, Row, Col, Button, Input } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import ModalAttributes from "./ModalAttributes";

interface Field {
  id: number;
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
  ai: boolean;
}

export default memo(function EntityNode() {
  const [open, setOpen] = useState(false);
  const [entityName, setEntityName] = useState("Entidade");
  const [fields, setFields] = useState<Field[]>([]);

  return (
    <>
      <ModalAttributes
        open={open}
        setOpen={setOpen}
        fields={fields}
        setFields={setFields}
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
              onChange={(e) => setEntityName(e.target.value)}
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

            <DeleteOutlined style={{ cursor: "pointer", color: "#B11226" }} />
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
              {field.name || "-"}
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
      </Card>
    </>
  );
});
