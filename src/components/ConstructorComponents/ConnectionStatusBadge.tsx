import { Tooltip } from "antd";
import type { ConnectionStatus } from "../../services/realtimeService";

const LABELS: Record<ConnectionStatus, { text: string; color: string; hint: string }> = {
  connected: {
    text: "Conectado",
    color: "#2F7D32",
    hint: "As alterações estão sendo sincronizadas em tempo real.",
  },
  connecting: {
    text: "Conectando…",
    color: "#d48806",
    hint: "Estabelecendo a conexão em tempo real.",
  },
  reconnecting: {
    text: "Reconectando…",
    color: "#d48806",
    hint: "A conexão caiu. Você pode continuar editando: as alterações serão enviadas quando ela voltar.",
  },
  offline: {
    text: "Offline",
    color: "#B11226",
    hint: "Sem conexão em tempo real. Recarregue a página para tentar novamente.",
  },
};

type Props = {
  status: ConnectionStatus;
  pendingCount: number;
};

export function ConnectionStatusBadge({ status, pendingCount }: Props) {
  const label = LABELS[status];
  const pending =
    pendingCount > 0
      ? ` · ${pendingCount} ${pendingCount === 1 ? "alteração aguardando" : "alterações aguardando"}`
      : "";

  return (
    <Tooltip title={label.hint}>
      <span
        role="status"
        aria-live="polite"
        data-connection-status={status}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: label.color,
            display: "inline-block",
          }}
        />
        {label.text}
        {pending}
      </span>
    </Tooltip>
  );
}
