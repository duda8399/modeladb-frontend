import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Empty, List, Popover, Typography, notification } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invitationsService, roleLabel, type Invitation } from "../../services/invitationsService";

const { Text } = Typography;

function describe(invitation: Invitation) {
  const owner = invitation.owner?.name || invitation.owner?.email || "Alguém";
  return `${owner} compartilhou "${invitation.diagramName}" com você como ${roleLabel(invitation.role)}.`;
}

export function InvitationsBell({ color = "#fff" }: { color?: string }) {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [notifier, contextHolder] = notification.useNotification();

  const openDiagram = useCallback(
    (invitation: Invitation) => {
      setInvitations((current) => current.filter((i) => i.diagramId !== invitation.diagramId));
      void invitationsService.markSeen([invitation.diagramId]).catch(() => undefined);
      setOpen(false);
      navigate(`/model/${invitation.diagramId}`);
    },
    [navigate],
  );

  useEffect(() => {
    let active = true;
    invitationsService
      .list()
      .then((list) => active && setInvitations(list))
      .catch(() => undefined);

    const unsubscribe = invitationsService.subscribe((invitation) => {
      setInvitations((current) => [invitation, ...current.filter((i) => i.diagramId !== invitation.diagramId)]);
      const key = `invite-${invitation.diagramId}`;
      notifier.info({
        key,
        message: "Novo diagrama compartilhado",
        description: describe(invitation),
        placement: "topRight",
        actions: (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              notifier.destroy(key);
              openDiagram(invitation);
            }}
          >
            Abrir
          </Button>
        ),
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [notifier, openDiagram]);

  const markAll = () => {
    setInvitations([]);
    void invitationsService.markSeen().catch(() => undefined);
  };

  const content = (
    <div style={{ width: 320 }}>
      {invitations.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum convite novo" />
      ) : (
        <>
          <List
            size="small"
            dataSource={invitations}
            rowKey="diagramId"
            renderItem={(invitation) => (
              <List.Item
                data-testid="invitation-item"
                style={{ cursor: "pointer", padding: "8px 4px" }}
                onClick={() => openDiagram(invitation)}
              >
                <div>
                  <Text>{describe(invitation)}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(invitation.invitedAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </div>
              </List.Item>
            )}
          />
          <Button type="link" block onClick={markAll}>
            Marcar todos como vistos
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      {contextHolder}
      <Popover
        content={content}
        title="Convites"
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
      >
        <Button type="text" aria-label="Convites" style={{ color }}>
          <Badge count={invitations.length} size="small" offset={[2, -2]}>
            <BellOutlined style={{ fontSize: 18, color }} />
          </Badge>
        </Button>
      </Popover>
    </>
  );
}
