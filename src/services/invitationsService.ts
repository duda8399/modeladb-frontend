import { io, type Socket } from "socket.io-client";
import { api, getValidAccessToken } from "./api";

export type Invitation = {
  diagramId: string;
  diagramName: string;
  role: "EDITOR" | "VIEWER";
  invitedAt: string;
  owner: { id: string; name: string; email: string } | null;
};

type Listener = (invitation: Invitation) => void;

const DISCONNECT_GRACE_MS = 1000;

let socket: Socket | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function ensureSocket() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  if (socket) return;

  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: (cb) => {
      getValidAccessToken()
        .then((token) => cb({ token: token ?? "" }))
        .catch(() => cb({ token: "" }));
    },
  });
  socket.on("invitation_received", (invitation: Invitation) => {
    listeners.forEach((listener) => listener(invitation));
  });
}

export const invitationsService = {
  async list(): Promise<Invitation[]> {
    const { data } = await api.get<Invitation[]>("/diagram/invitations");
    return Array.isArray(data) ? data : [];
  },

  async markSeen(diagramIds?: string[]): Promise<void> {
    await api.post("/diagram/invitations/seen", diagramIds ? { diagramIds } : {});
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    ensureSocket();

    return () => {
      listeners.delete(listener);
      if (listeners.size > 0 || disconnectTimer) return;
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        if (listeners.size > 0) return;
        socket?.removeAllListeners();
        socket?.disconnect();
        socket = null;
      }, DISCONNECT_GRACE_MS);
    };
  },
};

export function roleLabel(role: Invitation["role"]): string {
  return role === "EDITOR" ? "Editor" : "Visualizador";
}
