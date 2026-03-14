import { Button, Modal } from "antd";

type ModalAtributtesProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ModalAtributtes({
  open,
  setOpen,
}: ModalAtributtesProps) {
  return (
    <Modal
      width={600}
      open={open}
      onCancel={() => setOpen(false)}
      title={
        <div
          style={{
            fontSize: 20,
            fontWeight: "bold",
            borderBottom: "1px solid #d9d9d9",
            paddingBottom: 8,
            marginBottom: 16,
            color: "#595959",
          }}
        >
          Configurar atributos
        </div>
      }
      footer={[
        <div
          key="footer-button"
          className="flex justify-end items-center gap-2"
          style={{
            borderTop: "1px solid #d9d9d9",
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <Button type="default" style={{ marginRight: 5 }} onClick={() => {}}>
            Descartar alterações
          </Button>

          <Button type="primary" onClick={() => setOpen(false)}>
            Salvar
          </Button>
        </div>,
      ]}
    >
      <div className="grid grid-cols-8 font-['Noto Sans'] text-gray-900 mb-4">
        <div className="col-span-2 text-sm font-medium">Nome</div>
        <div className="col-span-5 text-sm font-medium">Tipo</div>
      </div>

      <div className="flex justify-center">
        <Button type="dashed">Adicionar atributo</Button>
      </div>
    </Modal>
  );
}
