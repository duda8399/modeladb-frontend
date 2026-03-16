import React, { useCallback, useMemo } from "react";
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
  type Node,
} from "@xyflow/react";

import { SidebarConstructor } from "./SidebarConstructor";
import { Layout } from "antd";
import { Navbar } from "../../components/LayoutComponents/Navbar";
import { EditorToolbar } from "./EditorToolbar";
import EntityNode from "../../components/ConstructorComponents/EntityNode";

const ConstructorPage: React.FC = () => {
  const nodeTypes = useMemo(
    () => ({
      entityNode: EntityNode,
    }),
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const addEntityNode = useCallback(() => {
    const newNode: Node = {
      id: crypto.randomUUID(),
      type: "entityNode",
      position: {
        x: 250,
        y: 150,
      },
      data: {},
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

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
        <SidebarConstructor onAddEntity={addEntityNode} />

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />

            <Controls
              position="bottom-right"
              style={{ right: 210, bottom: 20 }}
              fitViewOptions={{
                maxZoom: 1,
                padding: 0.2,
                duration: 300,
              }}
            />

            <MiniMap pannable zoomable nodeColor="gray" />
          </ReactFlow>
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
