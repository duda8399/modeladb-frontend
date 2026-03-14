import { memo, useState } from "react";
import { Card, Row, Col, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import ModalAtributtes from "./ModalAttributes";

const fields = [
  { campo: "Campo", tipo: "Tipo" },
  { campo: "Campo", tipo: "Tipo" },
];

export default memo(function EntityNode() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ModalAtributtes open={open} setOpen={setOpen} />
      <Card
        size="small"
        bordered={false}
        style={{ width: 240 }}
        styles={{
          header: {
            background: "#d9d9d9",
            padding: "6px 10px",
          },
          body: {
            padding: 0,
          },
        }}
        title={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Entidade</span>

            <DeleteOutlined style={{ cursor: "pointer", color: "#B11226" }} />
          </div>
        }
      >
        {fields.map((field, i) => (
          <Row
            key={i}
            align="middle"
            style={{
              borderTop: "1px solid #f0f0f0",
            }}
          >
            <Col
              span={12}
              style={{
                padding: "6px 8px",
                borderRight: "1px solid #f0f0f0",
              }}
            >
              {field.campo}
            </Col>

            <Col
              span={12}
              style={{
                padding: "6px 8px",
                borderRight: "1px solid #f0f0f0",
              }}
            >
              {field.tipo}
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
