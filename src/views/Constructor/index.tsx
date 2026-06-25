import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import "reactflow/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  ConnectionMode,
  type Connection,
  type Edge,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from "reactflow";
import { SidebarConstructor } from "./SidebarConstructor";
import { Layout, message } from "antd";
import { Navbar } from "../../components/LayoutComponents/Navbar";
import { EditorToolbar } from "./EditorToolbar";
import EntityNode from "../../components/ConstructorComponents/EntityNode";
import NoteNode from "../../components/ConstructorComponents/NoteNode";
import SectionNode from "../../components/ConstructorComponents/SectionNode";
import TextNode from "../../components/ConstructorComponents/TextNode";
import RelationModal from "../../components/ConstructorComponents/RelationModal";
import RemoveEdge from "../../components/ConstructorComponents/RemoverEdge";
import FloatingEdge from "../../components/ConstructorComponents/FloatingEdge";
import type {
  CustomEdge,
  CustomNode,
  RemoveEdgeData,
} from "../../types/diagramER";
import { useParams } from "react-router-dom";
import { api } from "../../services/api";

type DiagramSnapshot = {
  nodes: CustomNode[];
  edges: CustomEdge[];
  diagramName: string;
};

const cloneSnapshot = (snapshot: DiagramSnapshot): DiagramSnapshot =>
  structuredClone(snapshot);

const ConstructorPage: React.FC = () => {
  const { id } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const { getNodes, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CustomEdge>([]);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(
    null,
  );
  const [openRelationModal, setOpenRelationModal] = useState(false);
  const [removeEdgeData, setRemoveEdgeData] = useState<RemoveEdgeData | null>(
    null,
  );
  const [diagramName, setDiagramName] = useState("");
  const [saving, setSaving] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [bgColorMode, setBgColorMode] = useState(false);
  const [currentBgColor, setCurrentBgColor] = useState("#63b3ed");
  const reactFlowContainerRef = useRef<HTMLDivElement>(null);
  const pastHistoryRef = useRef<DiagramSnapshot[]>([]);
  const futureHistoryRef = useRef<DiagramSnapshot[]>([]);
  const currentSnapshotRef = useRef<DiagramSnapshot>({
    nodes: [],
    edges: [],
    diagramName: "",
  });

  useEffect(() => {
    currentSnapshotRef.current = cloneSnapshot({
      nodes,
      edges,
      diagramName,
    });
  }, [diagramName, edges, nodes]);

  const syncHistoryAvailability = useCallback(() => {
    setCanUndo(pastHistoryRef.current.length > 0);
    setCanRedo(futureHistoryRef.current.length > 0);
  }, []);

  const createSnapshot = useCallback(
    (): DiagramSnapshot => cloneSnapshot(currentSnapshotRef.current),
    [],
  );

  const captureHistory = useCallback(() => {
    pastHistoryRef.current.push(createSnapshot());
    futureHistoryRef.current = [];
    syncHistoryAvailability();
  }, [createSnapshot, syncHistoryAvailability]);

  const EntityNodeWithHistory = useCallback(
    (props: any) => <EntityNode {...props} onBeforeDelete={captureHistory} />,
    [captureHistory],
  );
  const NoteNodeWithHistory = useCallback(
    (props: any) => <NoteNode {...props} onBeforeDelete={captureHistory} />,
    [captureHistory],
  );
  const SectionNodeWithHistory = useCallback(
    (props: any) => <SectionNode {...props} onBeforeDelete={captureHistory} />,
    [captureHistory],
  );
  const TextNodeWithHistory = useCallback(
    (props: any) => <TextNode {...props} onBeforeDelete={captureHistory} />,
    [captureHistory],
  );
  const nodeTypes = useMemo(
    () => ({
      entityNode: EntityNodeWithHistory,
      noteNode: NoteNodeWithHistory,
      sectionNode: SectionNodeWithHistory,
      textNode: TextNodeWithHistory,
    }),
    [
      EntityNodeWithHistory,
      NoteNodeWithHistory,
      SectionNodeWithHistory,
      TextNodeWithHistory,
    ],
  );

  const edgeTypes = useMemo(() => ({ floating: FloatingEdge }), []);

  const applySnapshot = useCallback(
    (snapshot: DiagramSnapshot) => {
      setDiagramName(snapshot.diagramName);
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    [setEdges, setNodes],
  );

  const handleUndo = useCallback(() => {
    const previous = pastHistoryRef.current.pop();
    if (!previous) return;

    const current = createSnapshot();

    futureHistoryRef.current.unshift(current);
    applySnapshot(previous);
    syncHistoryAvailability();
  }, [applySnapshot, createSnapshot, syncHistoryAvailability]);

  const handleRedo = useCallback(() => {
    const next = futureHistoryRef.current.shift();
    if (!next) return;

    const current = createSnapshot();

    pastHistoryRef.current.push(current);
    applySnapshot(next);
    syncHistoryAvailability();
  }, [applySnapshot, createSnapshot, syncHistoryAvailability]);

  useEffect(() => {
    const loadDiagram = async () => {
      if (!id) return;

      try {
        const { data } = await api.get(`/diagram/${id}`);

        const loadedName = data?.name || "";
        const loadedNodes = Array.isArray(data?.nodes) ? data.nodes : [];
        let loadedEdges = Array.isArray(data?.edges) ? data.edges : [];

        loadedEdges = loadedEdges.map((edge: any) => {
          // Arestas antigas eram "bezier" com handle fixo; convertemos para
          // "floating" para que o traçado acompanhe a posição das tabelas.
          const normalizedEdge = { ...edge, type: "floating" };

          if (!edge.data) {
            const sourceNode = loadedNodes.find(
              (n: any) => n.id === edge.source,
            );
            const sourceName = (sourceNode?.data as any)?.name || edge.source;

            return {
              ...normalizedEdge,
              data: {
                relationType: "1:1",
                sourceNodeId: edge.source,
                targetNodeId: edge.target,
                fkFieldName: `fk_${sourceName}_id`,
              },
            };
          }
          return normalizedEdge;
        });

        setDiagramName(loadedName);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        pastHistoryRef.current = [];
        futureHistoryRef.current = [];
        syncHistoryAvailability();
      } catch (error: any) {
        const errorMessage = error?.response?.data?.message;
        messageApi.error(
          errorMessage || "Nao foi possivel carregar o diagrama",
        );
      }
    };

    loadDiagram();
  }, [id, messageApi, setEdges, setNodes, syncHistoryAvailability]);

  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
    setOpenRelationModal(true);
  }, []);

  const onSelectRelationType = (relationType: "1:1" | "1:N" | "N:N") => {
    if (!pendingConnection) return;

    captureHistory();

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
        type: "floating",
        data: {
          relationType: "1:N",
          sourceNodeId: sourceNodeId as string,
          targetNodeId: targetNodeId as string,
          junctionId,
        },
      };

      const edge2: CustomEdge = {
        id: crypto.randomUUID(),
        source: junctionId,
        target: targetNodeId as string,
        label: "1:N",
        type: "floating",
        data: {
          relationType: "1:N",
          sourceNodeId: sourceNodeId as string,
          targetNodeId: targetNodeId as string,
          junctionId,
        },
      };

      setEdges((eds) => [...eds, edge1, edge2]);
    } else {
      setEdges((eds) =>
        addEdge(
          {
            ...pendingConnection,
            label: relationType,
            type: "floating",
            data: {
              relationType,
              sourceNodeId: sourceNodeId as string,
              targetNodeId: targetNodeId as string,
              fkFieldName: `fk_${sourceName}_id`,
            },
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

  const handleBgColorChange = useCallback((color: string) => {
    setCurrentBgColor(color);
    setBgColorMode(true);
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: CustomNode) => {
      if (!bgColorMode || node.type !== "sectionNode") return;
      captureHistory();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, data: { ...n.data, bgColor: currentBgColor } }
            : n,
        ),
      );
    },
    [bgColorMode, currentBgColor, captureHistory, setNodes],
  );

  const handlePaneClick = useCallback(() => {
    setBgColorMode(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBgColorMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const getNewNodePosition = useCallback(() => {
    const existingNodes = getNodes();
    const offset = (existingNodes.length % 8) * 40;
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    return { x: center.x + offset, y: center.y + offset };
  }, [getNodes, screenToFlowPosition]);

  const addTextNode = useCallback(() => {
    captureHistory();

    const newNode: CustomNode = {
      id: crypto.randomUUID(),
      type: "textNode",
      position: getNewNodePosition(),
      data: { text: "" },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [captureHistory, setNodes, getNewNodePosition]);

  const addSectionNode = useCallback(() => {
    captureHistory();

    const newNode: CustomNode = {
      id: crypto.randomUUID(),
      type: "sectionNode",
      position: getNewNodePosition(),
      style: { width: 300, height: 200, zIndex: -1 },
      data: { label: "Seção" },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [captureHistory, setNodes, getNewNodePosition]);

  const addNoteNode = useCallback(() => {
    captureHistory();

    const newNode: CustomNode = {
      id: crypto.randomUUID(),
      type: "noteNode",
      position: getNewNodePosition(),
      data: { text: "" },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [captureHistory, setNodes, getNewNodePosition]);

  const addEntityNode = useCallback(() => {
    captureHistory();

    const newNode: CustomNode = {
      id: crypto.randomUUID(),
      type: "entityNode",
      position: getNewNodePosition(),
      data: {
        name: "Entidade",
        fields: [],
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [captureHistory, setNodes, getNewNodePosition]);

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

  const captureThumbnail = async (): Promise<string | undefined> => {
    if (!reactFlowContainerRef.current) return undefined;

    try {
      const nodesBounds = getNodesBounds(getNodes());

      getViewportForBounds(
        nodesBounds,
        nodesBounds.width + 200,
        nodesBounds.height + 200,
        0.5,
        2,
        0.1,
      );

      const flow = reactFlowContainerRef.current.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement;

      if (!flow) return undefined;

      const canvas = await html2canvas(flow, {
        backgroundColor: "#fff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: nodesBounds.width + 200,
        height: nodesBounds.height + 200,
        x: nodesBounds.x - 100,
        y: nodesBounds.y - 100,
        windowWidth: nodesBounds.width + 200,
        windowHeight: nodesBounds.height + 200,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.4),
      );

      if (!blob) return undefined;

      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  };

  const handleSave = useCallback(async () => {
    if (!id) return;

    setSaving(true);

    try {
      const thumbnail = await captureThumbnail();

      await api.put(`/diagram/${id}`, {
        name: diagramName,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type || "entityNode",
          data: node.data,
          position: {
            x: Number(node.position?.x ?? 0),
            y: Number(node.position?.y ?? 0),
          },
          style: node.style ?? null,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle || null,
          target: edge.target,
          label: edge.label ?? null,
          type: edge.type || "floating",
          data: edge.data,
        })),
        ...(thumbnail ? { thumbnail } : {}),
      });

      messageApi.success("Diagrama salvo com sucesso");
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;
      messageApi.error(errorMessage || "Não foi possível salvar o diagrama");
    } finally {
      setSaving(false);
    }
  }, [diagramName, edges, id, messageApi, nodes]);

  return (
    <Layout style={{ margin: 0, padding: 0 }}>
      {contextHolder}
      <RelationModal
        open={openRelationModal}
        onCancel={() => setOpenRelationModal(false)}
        onSelect={onSelectRelationType}
      />

      <Navbar />
      <EditorToolbar
        diagramName={diagramName}
        onDiagramNameChange={setDiagramName}
        onSave={handleSave}
        saving={saving}
        nodes={nodes}
        edges={edges}
        setNodes={setNodes}
        setEdges={setEdges}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBeforeImportReplace={captureHistory}
        bgColorActive={bgColorMode}
        bgColor={currentBgColor}
        onBgColorChange={handleBgColorChange}
      />

      <div
        style={{
          display: "flex",
          height: "87vh",
          overflow: "hidden",
        }}
      >
        <SidebarConstructor
          onAddEntity={addEntityNode}
          onAddNote={addNoteNode}
          onAddSection={addSectionNode}
          onAddText={addTextNode}
        />

        <div
          ref={reactFlowContainerRef}
          style={{
            flex: 1,
            cursor: bgColorMode ? "crosshair" : undefined,
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={captureHistory}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
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
              onBeforeRemoveEdge={captureHistory}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
