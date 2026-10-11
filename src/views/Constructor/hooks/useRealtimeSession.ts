import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import realtimeService, {
  type AccessRevokedEvent,
  type ConnectionStatus,
  type DocumentRestoredEvent,
  type PresenceEvent,
  type PresenceUser,
  type RealtimeError,
  type RoleChangedEvent,
} from "../../../services/realtimeService";
import { getValidAccessToken } from "../../../services/api";
import type { Operation } from "../../../stores/diagramCollabStore";

export type RemoteCursor = { x: number; y: number; lastSeen: number };

type Handlers = {
  onRemoteOperation: (op: Operation) => void;
  onResyncNeeded: () => Promise<void>;
  onDocumentRestored: (event: DocumentRestoredEvent) => void;
  onRoleChanged: (event: RoleChangedEvent) => void;
  onAccessRevoked: (event: AccessRevokedEvent) => void;
  onError: (error: RealtimeError) => void;
};

type Params = Handlers & {
  diagramId?: string;
  userId: string;
  enabled: boolean;
};

const CURSOR_TTL_MS = 10_000;
const CURSOR_PRUNE_MS = 5_000;
const CURSOR_THROTTLE_MS = 50;

function without<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function useRealtimeSession({ diagramId, userId, enabled, ...handlers }: Params) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceUser>>({});
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [pendingCount, setPendingCount] = useState(0);
  const handlersRef = useRef<Handlers>(handlers);
  const lastCursorSentRef = useRef(0);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  const handlePresence = useCallback((event: PresenceEvent) => {
    if (event.type === "ONLINE_USERS") {
      setOnlineUsers(Object.fromEntries(event.users.map((u) => [u.userId, u])));
    }

    if (event.type === "USER_JOINED") {
      setOnlineUsers((prev) => ({ ...prev, [event.userId]: { userId: event.userId, email: event.email } }));
    }

    if (event.type === "USER_LEFT") {
      setOnlineUsers((prev) => without(prev, event.userId));
      setCursors((prev) => without(prev, event.userId));
    }
  }, []);

  const reset = useCallback(() => {
    setOnlineUsers({});
    setCursors({});
    setPendingCount(0);
    setStatus("offline");
  }, []);

  const disconnect = useCallback(() => {
    realtimeService.disconnect();
    reset();
  }, [reset]);

  useEffect(() => {
    if (!enabled || !diagramId || !userId) return;

    realtimeService.connect({
      diagramId,
      getToken: getValidAccessToken,
      onOperation: (op) => handlersRef.current.onRemoteOperation(op),
      onPresence: handlePresence,
      onCursor: (cursor) =>
        setCursors((prev) => ({ ...prev, [cursor.userId]: { x: cursor.x, y: cursor.y, lastSeen: Date.now() } })),
      onError: (error) => handlersRef.current.onError(error),
      onDocumentRestored: (event) => handlersRef.current.onDocumentRestored(event),
      onRoleChanged: (event) => handlersRef.current.onRoleChanged(event),
      onAccessRevoked: (event) => handlersRef.current.onAccessRevoked(event),
      onResyncNeeded: () => handlersRef.current.onResyncNeeded(),
      onStatusChange: (next, pending) => {
        setStatus(next);
        setPendingCount(pending);
      },
    });

    return () => {
      realtimeService.disconnect();
      reset();
    };
  }, [enabled, diagramId, userId, handlePresence, reset]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const entries = Object.entries(prev).filter(([, c]) => now - c.lastSeen <= CURSOR_TTL_MS);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, CURSOR_PRUNE_MS);

    return () => clearInterval(interval);
  }, []);

  const sendCursor = useCallback((position: { x: number; y: number }) => {
    const now = Date.now();
    if (now - lastCursorSentRef.current < CURSOR_THROTTLE_MS) return;
    lastCursorSentRef.current = now;
    realtimeService.sendCursor(position);
  }, []);

  return {
    onlineUsers,
    cursors,
    status,
    pendingCount,
    sendCursor,
    disconnect,
  };
}
