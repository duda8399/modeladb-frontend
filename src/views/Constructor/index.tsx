import React, { useCallback } from "react";
import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from "@xyflow/react";
import { SidebarConstructor } from "./SidebarConstructor";
import { Layout } from "antd";
import { Navbar } from "../../components/LayoutComponents/Navbar";
import { EditorToolbar } from "./EditorToolbar";

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
    [],
  );

  return (
    <Layout>
      <Navbar />
      <EditorToolbar />

      <div
        style={{
          display: "flex",
          height: "calc(100vh - 64px)",
          overflow: "hidden",
        }}
      >
        <SidebarConstructor />

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <Controls
              position="bottom-right"
              style={{ right: 210, bottom: 20 }}
              fitViewOptions={{ maxZoom: 1, padding: 0.2, duration: 300 }}
            />

            <MiniMap pannable zoomable nodeColor={"gray"} />
          </ReactFlow>
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
