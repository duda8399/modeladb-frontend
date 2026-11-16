import { io, Socket } from "socket.io-client";
import type { Operation } from "../stores/diagramCollabStore";

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

export type DocumentRenamedEvent = { diagramId: string; name: string; byUserId: string };

export type RoleChangedEvent = { diagramId: string; role: CollaboratorRole };

export type AccessRevokedEvent = {
  diagramId: string;
  reason: "left" | "removed" | "deleted";
};

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export type SyncCursor = { epoch: string; seq: number };

export type SyncEvent = SyncCursor & {
  ops: Operation[];
  complete: boolean;
  initial: boolean;
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
  onDocumentRenamed?: (event: DocumentRenamedEvent) => void;
  onAccessRevoked?: (event: AccessRevokedEvent) => void;
  onStatusChange?: (status: ConnectionStatus, pendingCount: number) => void;
  onResyncNeeded?: () => Promise<void> | void;
};

const MAX_SERVER_RETRIES = 5;

class RealtimeService {
  private socket: Socket | null = null;
  private params: ConnectParams | null = null;
  private cursor: SyncCursor | null = null;
  private queue: Operation[] = [];
  private buffered: [Operation, SyncCursor | undefined][] = [];
  private joined = false;
  private resyncing = false;
  private status: ConnectionStatus = "offline";
  private serverRetries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  connect(params: ConnectParams) {
    if (this.socket) return;

    this.params = params;
    this.cursor = null;
    this.queue = [];
    this.buffered = [];
    this.joined = false;
    this.resyncing = false;
    this.serverRetries = 0;

    const socket = io(import.meta.env.VITE_BACKEND_URL, {
      auth: (cb) => {
        Promise.resolve(params.getToken())
          .then((token) => cb({ token: token ?? "" }))
          .catch(() => cb({ token: "" }));
      },
    });

    socket.on("connect", () => {
      this.joined = false;
      socket.emit("join_diagram", {
        diagramId: params.diagramId,
        ...(this.cursor ? { since: this.cursor } : {}),
      });
    });

    socket.on("sync", (event: SyncEvent) => this.handleSync(event));

    socket.on("operation", (operation: Operation, meta?: SyncCursor) => {
      if (this.resyncing) {
        this.buffered.push([operation, meta]);
        return;
      }
      this.receive(operation, meta);
    });

    socket.on("disconnect", (reason: string) => {
      this.joined = false;

      if (reason === "io client disconnect") return;

      if (reason === "io server disconnect") {
        this.retryAfterServerDisconnect();
        return;
      }

      this.setStatus("reconnecting");
    });

    socket.on("connect_error", () => {
      this.setStatus(this.cursor ? "reconnecting" : "connecting");
    });

    socket.on("presence", params.onPresence);
    socket.on("cursor", params.onCursor);
    socket.on("error", (error: RealtimeError) => params.onError?.(error));
    socket.on("document_restored", (event: DocumentRestoredEvent) => params.onDocumentRestored?.(event));
    socket.on("role_changed", (event: RoleChangedEvent) => params.onRoleChanged?.(event));
    socket.on("document_renamed", (event: DocumentRenamedEvent) => params.onDocumentRenamed?.(event));
    socket.on("access_revoked", (event: AccessRevokedEvent) => params.onAccessRevoked?.(event));

    this.socket = socket;
    this.setStatus("connecting");
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.params = null;
    this.cursor = null;
    this.queue = [];
    this.buffered = [];
    this.joined = false;
    this.resyncing = false;
    this.status = "offline";
  }

  sendOperation(operation: Operation) {
    if (!this.socket) return;

    if (!this.joined || !this.socket.connected) {
      this.queue.push(operation);
      this.notifyStatus();
      return;
    }

    this.emitOperation(operation);
  }

  sendCursor(cursor: { x: number; y: number }) {
    if (!this.joined || !this.socket?.connected) return;

    this.socket.emit("cursor", cursor);
  }

  getPendingOperations(): Operation[] {
    return [...this.queue];
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private emitOperation(operation: Operation) {
    this.socket?.emit("operation", operation, (meta?: SyncCursor) => this.advance(meta));
  }

  private handleSync(event: SyncEvent) {
    this.serverRetries = 0;

    if (event.initial || event.complete) {
      event.ops.forEach((operation) => this.params?.onOperation(operation));
      this.cursor = { epoch: event.epoch, seq: event.seq };
      this.finishJoin();
      return;
    }

    this.cursor = { epoch: event.epoch, seq: event.seq };
    this.resyncing = true;
    const catchUp = event.ops ?? [];
    this.setStatus("reconnecting");

    let reload: Promise<void> | void;

    try {
      reload = this.params?.onResyncNeeded?.();
    } catch {
      reload = undefined;
    }

    Promise.resolve(reload)
      .catch(() => undefined)
      .finally(() => {
        this.resyncing = false;
        catchUp.forEach((operation) => this.params?.onOperation(operation));
        this.buffered.splice(0).forEach(([operation, meta]) => this.receive(operation, meta));
        this.finishJoin();
      });
  }

  private finishJoin() {
    if (!this.socket?.connected) return;

    this.joined = true;
    this.queue.splice(0).forEach((operation) => this.emitOperation(operation));
    this.setStatus("connected");
  }

  private receive(operation: Operation, meta?: SyncCursor) {
    this.advance(meta);
    this.params?.onOperation(operation);
  }

  private advance(meta?: SyncCursor) {
    if (!meta || typeof meta.seq !== "number") return;

    if (!this.cursor || this.cursor.epoch !== meta.epoch || meta.seq > this.cursor.seq) {
      this.cursor = { epoch: meta.epoch, seq: meta.seq };
    }
  }

  private retryAfterServerDisconnect() {
    if (this.serverRetries >= MAX_SERVER_RETRIES) {
      this.setStatus("offline");
      return;
    }

    this.serverRetries += 1;
    this.setStatus("reconnecting");
    const delay = Math.min(1000 * 2 ** (this.serverRetries - 1), 15000);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.socket?.connect();
    }, delay);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.notifyStatus();
  }

  private notifyStatus() {
    this.params?.onStatusChange?.(this.status, this.queue.length);
  }
}

export default new RealtimeService();
