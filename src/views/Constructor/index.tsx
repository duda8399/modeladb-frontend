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

    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const targetNode = nodes.find((n) => n.id === targetNodeId);

    const sourceName = (sourceNode?.data as any)?.name || sourceNodeId;
    const targetName = (targetNode?.data as any)?.name || targetNodeId;

    if (relationType === "N:N") {
      const junctionId = crypto.randomUUID();

      const fkFieldSource = {
        id: crypto.randomUUID(),
        name: `fk_${sourceName}_id`,
        type: "INT",
        pk: true,
        fk: true,
        notNull: true,
        unique: false,
        ai: false,
      };

      const fkFieldTarget = {
        id: crypto.randomUUID(),
        name: `fk_${targetName}_id`,
        type: "INT",
        pk: true,
        fk: true,
        notNull: true,
        unique: false,
        ai: false,
      };

      const sx = (sourceNode?.position as any)?.x ?? 250;
      const sy = (sourceNode?.position as any)?.y ?? 150;
      const tx = (targetNode?.position as any)?.x ?? 250;
      const ty = (targetNode?.position as any)?.y ?? 150;

      const junctionNode: CustomNode = {
        id: junctionId,
        type: "entityNode",
        position: {
          x: (sx + tx) / 2,
          y: (sy + ty) / 2,
        },
        data: {
          name: `${sourceName}_${targetName}`,
          fields: [fkFieldSource, fkFieldTarget],
        },
      };

      setNodes((nds) => [...nds, junctionNode]);

      const edge1: CustomEdge = {
        id: crypto.randomUUID(),
        source: sourceNodeId as string,
        target: junctionId,
        label: "1:N",
        type: "bezier",
        data: { relationType: "1:N" },
      };

      const edge2: CustomEdge = {
        id: crypto.randomUUID(),
        source: junctionId,
        target: targetNodeId as string,
        label: "1:N",
        type: "bezier",
        data: { relationType: "1:N" },
      };

      setEdges((eds) => [...eds, edge1, edge2]);
    } else {
      // 1:1 e 1:N: adiciona aresta e adiciona FK no nó destino
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

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === targetNodeId) {
            const newField = {
              id: crypto.randomUUID(),
              name: `fk_${sourceName}_id`,
              type: "INT",
              pk: false,
              fk: true,
              notNull: false,
              unique: false,
              ai: false,
            };

            return {
              ...node,
              data: {
                ...node.data,
                fields: [...((node.data as any).fields || []), newField],
              },
            };
          }
          return node;
        }),
      );
    }

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
        name: "Entidade",
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
