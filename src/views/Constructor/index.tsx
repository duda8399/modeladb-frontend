import React, { useCallback, useState } from "react";
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
import EntityNode from "../../components/ConstructorComponents/EntityNode";

const ConstructorPage: React.FC = () => {
  const initialNodes = [
    {
      id: "1",
      type: "entityNode",
      data: {},
      position: { x: 0.2, y: 0 },
    },
  ];

  const [nodeTypes, setNodeTypes] = useState({
    entityNode: EntityNode,
  });
  const [nodes, _, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [],
  );

  return (
    <Layout style={{ margin: 0, padding: 0 }}>
      <Navbar />
      <EditorToolbar />

      <div
        style={{
          display: "flex",
          height: "87vh",
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
            nodeTypes={nodeTypes}
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
