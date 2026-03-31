import { useCallback, useMemo, useState } from "react";
import "reactflow/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "reactflow";
import { SidebarConstructor } from "./SidebarConstructor";
import { Layout } from "antd";
import { Navbar } from "../../components/LayoutComponents/Navbar";
import { EditorToolbar } from "./EditorToolbar";
import EntityNode from "../../components/ConstructorComponents/EntityNode";
import RelationModal from "../../components/ConstructorComponents/RelationModal";
import RemoveEdge from "../../components/ConstructorComponents/RemoverEdge";
import type { CustomEdge, CustomNode, RemoveEdgeData } from "../../types/diagramER";

const ConstructorPage: React.FC = () => {
  const nodeTypes = useMemo(
    () => ({
      entityNode: EntityNode,
    }),
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CustomEdge>([]);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(
    null,
  );
  const [openRelationModal, setOpenRelationModal] = useState(false);
  const [removeEdgeData, setRemoveEdgeData] = useState<RemoveEdgeData | null>(
    null,
  );

  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
    setOpenRelationModal(true);
  }, []);

  const onSelectRelationType = (relationType: "1:1" | "1:N" | "N:N") => {
    if (!pendingConnection) return;

    const targetNodeId = pendingConnection.target;
    const sourceNodeId = pendingConnection.source;

    // Adiciona a relação como uma nova aresta
    setEdges((eds) =>
      addEdge(
        {
          ...pendingConnection,
          label: relationType,
          type: "bezier",
          data: { relationType },
        },
        eds,
      ),
    );

    // Adiciona a FK ao nó de destino
    setNodes((nds) =>
      nds.map((node) => {
        console.log('Node ID:', node.id, 'Target Node ID:', targetNodeId);
        if (node.id === targetNodeId) {
          const newField = {
            id: crypto.randomUUID(),
            name: `fk_${sourceNodeId}`,
            type: "INT",
            pk: false,
            fk: true,
            notNull: false,
            unique: false,
            ai: false,
          };

          console.log('Adding field to node:', node.id, 'Field:', newField);
          return {
            ...node,
            data: {
              ...node.data,
              fields: [...(node.data.fields || []), newField],
            },
          };
        }
        return node;
      }),
    );

    setPendingConnection(null);
    setOpenRelationModal(false);
  };

  const addEntityNode = useCallback(() => {
    const newNode: CustomNode = {
      id: crypto.randomUUID(),
      type: "entityNode",
      position: {
        x: 250,
        y: 150,
      },
      data: {
        fields: [],
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const onEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const { clientX, clientY } = event;
      setRemoveEdgeData({ x: clientX, y: clientY, edgeId: edge.id });
      setTimeout(() => {
        setRemoveEdgeData(null);
      }, 1500);
    },
    [],
  );

  return (
    <Layout style={{ margin: 0, padding: 0 }}>
      <RelationModal
        open={openRelationModal}
        onCancel={() => setOpenRelationModal(false)}
        onSelect={onSelectRelationType}
      />

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
            defaultEdgeOptions={{
              style: { strokeWidth: 2 },
              labelStyle: { fill: "#333", fontWeight: 600 },
            }}
            onEdgeMouseEnter={onEdgeMouseEnter}
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

          {removeEdgeData && (
            <RemoveEdge
              removeEdgeData={removeEdgeData}
              setRemoveEdgeData={setRemoveEdgeData}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
