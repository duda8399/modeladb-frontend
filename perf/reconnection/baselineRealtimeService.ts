import { io, Socket } from "socket.io-client";
import type { Operation } from "../../src/stores/diagramCollabStore";

export type PresenceUser = { userId: string; email?: string };

export type PresenceEvent =
  | { type: "ONLINE_USERS"; users: PresenceUser[] }
  | ({ type: "USER_JOINED" } & PresenceUser)
  | { type: "USER_LEFT"; userId: string };

export type CursorEvent = { userId: string; x: number; y: number };

export type RealtimeError = { message: string };

export type DocumentRestoredEvent = {
  diagramId: string;
  versionId: string;
  userId: string;
  userName: string | null;
};

export type CollaboratorRole = "EDITOR" | "VIEWER";

export type RoleChangedEvent = { diagramId: string; role: CollaboratorRole };

export type AccessRevokedEvent = {
  diagramId: string;
  reason: "left" | "removed" | "deleted";
};

type ConnectParams = {
  diagramId: string;
  getToken: () => Promise<string | null> | string | null;
  onOperation: (operation: Operation) => void;
  onPresence: (event: PresenceEvent) => void;
  onCursor: (cursor: CursorEvent) => void;
  onError?: (error: RealtimeError) => void;
  onDocumentRestored?: (event: DocumentRestoredEvent) => void;
  onRoleChanged?: (event: RoleChangedEvent) => void;
  onAccessRevoked?: (event: AccessRevokedEvent) => void;
};

class RealtimeService {
  private socket: Socket | null = null;

  connect(params: ConnectParams) {
    if (this.socket) return;

    const socket = io(import.meta.env.VITE_BACKEND_URL, {
      auth: (cb) => {
        Promise.resolve(params.getToken())
          .then((token) => cb({ token: token ?? "" }))
          .catch(() => cb({ token: "" }));
      },
    });

    socket.on("connect", () => {
      socket.emit("join_diagram", { diagramId: params.diagramId });
    });

    socket.on("operation", params.onOperation);
    socket.on("presence", params.onPresence);
    socket.on("cursor", params.onCursor);
    socket.on("error", (error: RealtimeError) => params.onError?.(error));
    socket.on("document_restored", (event: DocumentRestoredEvent) => params.onDocumentRestored?.(event));
    socket.on("role_changed", (event: RoleChangedEvent) => params.onRoleChanged?.(event));
    socket.on("access_revoked", (event: AccessRevokedEvent) => params.onAccessRevoked?.(event));

    this.socket = socket;
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  sendOperation(operation: Operation) {
    if (!this.socket?.connected) {
      console.warn("Socket ainda não conectado");
      return;
    }

    this.socket.emit("operation", operation);
  }

  sendCursor(cursor: { x: number; y: number }) {
    if (!this.socket?.connected) return;

    this.socket.emit("cursor", cursor);
  }
}

export default new RealtimeService();
