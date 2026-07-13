import { io, Socket } from "socket.io-client";
import type { Operation } from "../stores/diagramCollabStore";

export type PresenceUser = { userId: string; email?: string };

export type PresenceEvent =
  | { type: "ONLINE_USERS"; users: PresenceUser[] }
  | ({ type: "USER_JOINED" } & PresenceUser)
  | { type: "USER_LEFT"; userId: string };

export type CursorEvent = { userId: string; x: number; y: number };

export type RealtimeError = { message: string };

type ConnectParams = {
  diagramId: string;
  token: string;
  onOperation: (operation: Operation) => void;
  onPresence: (event: PresenceEvent) => void;
  onCursor: (cursor: CursorEvent) => void;
  onError?: (error: RealtimeError) => void;
};

class RealtimeService {
  private socket: Socket | null = null;

  connect(params: ConnectParams) {
    if (this.socket) return;

    const socket = io(import.meta.env.VITE_BACKEND_URL, {
      auth: { token: params.token },
    });

    socket.on("connect", () => {
      socket.emit("join_diagram", { diagramId: params.diagramId });
    });

    socket.on("operation", params.onOperation);
    socket.on("presence", params.onPresence);
    socket.on("cursor", params.onCursor);
    socket.on("error", (error: RealtimeError) => params.onError?.(error));

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
