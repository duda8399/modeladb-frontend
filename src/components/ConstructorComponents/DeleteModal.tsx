import { Modal } from "antd";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  setOpen: (value: boolean) => void;
  title?: string;
  description?: ReactNode;
}

export default function DeleteModal({
  open,
  setOpen,
  title = "Excluir",
  description = "Tem certeza que deseja excluir a entidade?",
}: Props) {
  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      onOk={() => {
        setOpen(false);
      }}
      okText="Excluir"
      cancelText="Cancelar"
      okButtonProps={{ danger: true }}
      title={title}
    >
      <p>{description}</p>
    </Modal>
  );
}
