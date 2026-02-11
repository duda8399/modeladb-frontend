import React, { useCallback } from "react";
import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from "@xyflow/react";
import { AppLayout } from "../../components/LayoutComponents/AppLayout";
import { SidebarConstructor } from "./SidebarConstructor";

const ConstructorPage: React.FC = () => {
  const initialNodes = [
    {
      id: "1",
      type: "input",
      data: { label: "input node" },
      position: { x: 250, y: 5 },
    },
  ];

  const [nodes, _, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  return (
    <AppLayout>
      <div style={{ display: "flex", height: "100vh" }}>

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <div
          style={{
            width: 200,
            borderLeft: "1px solid #e5e7eb",
            background: "#f9fafb",
          }}
        >
          <SidebarConstructor />
        </div>
      </div>
    </AppLayout>
  );
};

export default ConstructorPage;
