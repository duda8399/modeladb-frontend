import { Modal, Button } from "antd";

interface Props {
  open: boolean;
  onSelect: (type: "1:1" | "1:N" | "N:N") => void;
  onCancel: () => void;
}

export default function RelationModal({ open, onSelect, onCancel }: Props) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      title="Tipo de relacionamento"
    >
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <Button onClick={() => onSelect("1:1")}>1:1</Button>
        <Button onClick={() => onSelect("1:N")}>1:N</Button>
        <Button onClick={() => onSelect("N:N")}>N:N</Button>
      </div>
    </Modal>
  );
}
