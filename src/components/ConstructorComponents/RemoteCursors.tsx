import { useViewport } from "reactflow";
import type { PresenceUser } from "../../services/realtimeService";
import { colorForUserId } from "../../utils/presence";

type Props = {
  cursors: Record<string, { x: number; y: number }>;
  onlineUsers: Record<string, PresenceUser>;
};

export function RemoteCursors({ cursors, onlineUsers }: Props) {
  const { x, y, zoom } = useViewport();

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {Object.entries(cursors).map(([uid, cursor]) => {
        const color = colorForUserId(uid);

        return (
          <div
            key={uid}
            style={{
              position: "absolute",
              left: cursor.x * zoom + x,
              top: cursor.y * zoom + y,
              transform: "translate(-2px, -2px)",
              zIndex: 1000,
              color,
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "8px solid currentColor",
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
              }}
            />
            <div
              style={{
                marginTop: 2,
                padding: "2px 6px",
                background: "#fff",
                color,
                border: "1px solid currentColor",
                fontSize: 11,
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {onlineUsers[uid]?.email || uid}
            </div>
          </div>
        );
      })}
    </div>
  );
}
