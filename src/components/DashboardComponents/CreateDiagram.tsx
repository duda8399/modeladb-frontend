import React, { useEffect, useRef, useState } from "react";
import { Input, Modal, Button, Typography } from "antd";
import type { InputRef } from "antd";
import Diagram from "../../assets/diagram.png";

const { Title } = Typography;

interface CreateDiagramProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

const CreateDiagram: React.FC<CreateDiagramProps> = ({
  open,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState("");
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    onCreate(trimmed);
    setName("");
    onClose();
  };

  const handleCancel = () => {
    setName("");
    onClose();
  };

  return (
    <Modal open={open} onCancel={handleCancel} footer={null} width={650} centered>
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          padding: "40px 30px",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <img src={Diagram} alt="diagram" style={{ width: 160 }} />
        </div>

        <div style={{ flex: 1 }}>
          <Title level={4} style={{ marginTop: 0 }}>
            Defina um nome para seu novo diagrama
          </Title>

          <Input
            ref={inputRef}
            placeholder="Nome do seu novo diagrama"
            size="large"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleCreate}
            style={{ marginTop: 12 }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 30,
            }}
          >
            <Button onClick={handleCancel} style={{ width: 100 }}>
              Cancelar
            </Button>

            <Button
              type="primary"
              onClick={handleCreate}
              disabled={!name.trim()}
              style={{
                background: "#2F7D32",
                borderColor: "#2F7D32",
                width: 100,
              }}
            >
              Criar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CreateDiagram;
