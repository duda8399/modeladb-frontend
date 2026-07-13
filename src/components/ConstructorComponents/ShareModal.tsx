import { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Input,
  message,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { colorForUserId, initialFor } from "../../utils/presence";

type CollaboratorRole = "EDITOR" | "VIEWER";

interface CollaboratorRow {
  userId: string;
  role: CollaboratorRole;
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
}

const ROLE_OPTIONS = [
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Visualizador" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  diagramId: string;
  isOwner: boolean;
  currentUserId: string;
}

export default function ShareModal({
  open,
  onClose,
  diagramId,
  isOwner,
  currentUserId,
}: Readonly<Props>) {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("EDITOR");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (open) loadCollaborators();
  }, [open, diagramId]);

  async function loadCollaborators() {
    setLoading(true);
    try {
      const { data } = await api.get(`/diagram/${diagramId}/collaborators`);
      setCollaborators(data);
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message ||
          "Não foi possível carregar os colaboradores.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;

    setInviting(true);
    try {
      await api.post(`/diagram/${diagramId}/collaborators`, {
        email,
        role: inviteRole,
      });
      messageApi.success("Colaborador adicionado com sucesso.");
      setInviteEmail("");
      loadCollaborators();
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message || "Não foi possível convidar este usuário.",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, role: CollaboratorRole) {
    try {
      await api.patch(`/diagram/${diagramId}/collaborators/${userId}`, { role });
      setCollaborators((prev) =>
        prev.map((c) => (c.userId === userId ? { ...c, role } : c)),
      );
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message || "Não foi possível atualizar a permissão.",
      );
    }
  }

  async function handleRemove(userId: string) {
    try {
      await api.delete(`/diagram/${diagramId}/collaborators/${userId}`);
      setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
      messageApi.success("Colaborador removido.");
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message || "Não foi possível remover o colaborador.",
      );
    }
  }

  async function handleLeave() {
    try {
      await api.delete(`/diagram/${diagramId}/collaborators/${currentUserId}`);
      messageApi.success("Você saiu do diagrama.");
      onClose();
      navigate("/shared");
    } catch (error: any) {
      messageApi.error(
        error?.response?.data?.message || "Não foi possível sair do diagrama.",
      );
    }
  }

  return (
    <>
      {contextHolder}
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        title="Compartilhar diagrama"
        destroyOnHidden
      >
      {isOwner && (
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            placeholder="E-mail do colaborador"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onPressEnter={handleInvite}
          />
          <Select<CollaboratorRole>
            value={inviteRole}
            onChange={setInviteRole}
            options={ROLE_OPTIONS}
            style={{ width: 150 }}
          />
          <Button type="primary" onClick={handleInvite} loading={inviting}>
            Convidar
          </Button>
        </Space.Compact>
      )}

      <Spin spinning={loading}>
        <List
          dataSource={collaborators}
          locale={{ emptyText: "Ainda não há colaboradores neste diagrama." }}
          renderItem={(c) => (
            <List.Item
              actions={
                isOwner
                  ? [
                      <Select<CollaboratorRole>
                        key="role"
                        size="small"
                        value={c.role}
                        style={{ width: 130 }}
                        options={ROLE_OPTIONS}
                        onChange={(role) => handleRoleChange(c.userId, role)}
                      />,
                      <Popconfirm
                        key="remove"
                        title="Remover este colaborador?"
                        onConfirm={() => handleRemove(c.userId)}
                        okText="Remover"
                        cancelText="Cancelar"
                      >
                        <Button danger type="text" icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]
                  : [
                      <Tag key="role">
                        {c.role === "EDITOR" ? "Editor" : "Visualizador"}
                      </Tag>,
                    ]
              }
            >
              <List.Item.Meta
                avatar={
                  <Avatar style={{ background: colorForUserId(c.userId) }}>
                    {initialFor(c.user.name || c.user.email)}
                  </Avatar>
                }
                title={c.user.name}
                description={c.user.email}
              />
            </List.Item>
          )}
        />
      </Spin>

      {!isOwner && (
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Popconfirm
            title="Sair deste diagrama?"
            description="Você perderá acesso a ele."
            onConfirm={handleLeave}
            okText="Sair"
            cancelText="Cancelar"
          >
            <Button danger>Sair do diagrama</Button>
          </Popconfirm>
        </div>
      )}
      </Modal>
    </>
  );
}
