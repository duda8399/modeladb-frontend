import { useReactFlow, type XYPosition } from "@xyflow/react";
import { useCallback, useState } from "react";
import { Input, Collapse, Button } from "antd";
import { useDnD, useDnDPosition, type OnDropAction } from "./useDnD";
import {
  BorderOutlined,
  FileOutlined,
  FontSizeOutlined,
} from "@ant-design/icons";

const { Panel } = Collapse;

let id = 0;
const getId = () => `dndnode_${id++}`;

export function SidebarConstructor() {
  const { onDragStart, isDragging } = useDnD();
  const [type, setType] = useState<string | null>(null);
  const { setNodes } = useReactFlow();

  const createAddNewNode = useCallback(
    (nodeType: string): OnDropAction => {
      return ({ position }: { position: XYPosition }) => {
        const newNode = {
          id: getId(),
          type: nodeType,
          position,
          data: { label: `${nodeType} node` },
        };

        setNodes((nds) => nds.concat(newNode));
        setType(null);
      };
    },
    [setNodes],
  );

  const startDrag = (event: any, nodeType: string) => {
    setType(nodeType);
    onDragStart(event, createAddNewNode(nodeType));
  };

  return (
    <>
      {isDragging && <DragGhost type={type} />}

      <aside
        style={{
          background: "#fff",
          height: "100%",
          width: 260,
          padding: "10px",
          borderRight: "1px solid #e5e7eb",
        }}
      >
        <Collapse defaultActiveKey={["ai", "er"]} ghost>
          <Panel
            header="IA do ModelaDB"
            key="ai"
            style={{ borderBottom: "1px solid #8c8c8c" }}
          >
            <Input.TextArea
              placeholder="Descreva seu banco de dados..."
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
          </Panel>

          <Panel
            header="Padrão"
            key="default"
            style={{
              borderBottom: "1px solid #8c8c8c",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Button icon={<FontSizeOutlined />} />
              <Button icon={<BorderOutlined />} />
              <Button icon={<FileOutlined />} />
            </div>
          </Panel>

          <Panel
            header="ER"
            key="er"
            style={{ borderBottom: "1px solid #8c8c8c" }}
          >
            <div
              className="dndnode input"
              onPointerDown={(event) => startDrag(event, "input")}
            >
              Input
            </div>

            <div
              className="dndnode"
              onPointerDown={(event) => startDrag(event, "default")}
            >
              Default
            </div>

            <div
              className="dndnode output"
              onPointerDown={(event) => startDrag(event, "output")}
            >
              Output
            </div>
          </Panel>
        </Collapse>
      </aside>
    </>
  );
}

interface DragGhostProps {
  type: string | null;
}

export function DragGhost({ type }: DragGhostProps) {
  const { position } = useDnDPosition();

  if (!position) return null;

  return (
    <div
      className={`dndnode ghostnode ${type}`}
      style={{
        transform: `translate(${position.y}px, ${position.x}px) translate(-50%, -50%)`,
      }}
    >
      {type && `${type.charAt(0).toUpperCase() + type.slice(1)} Node`}
    </div>
  );
}
