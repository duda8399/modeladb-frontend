import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import html2canvas from "html2canvas";
import "reactflow/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
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
  Field,
  RemoveEdgeData,
} from "../../types/diagramER";
import { useParams } from "react-router-dom";
import { api } from "../../services/api";
import { getCurrentUser, getToken } from "../../utils/auth";
import realtimeService from "../../services/realtimeService";
import {
  useDiagramCollabStore,
  selectVisibleNodes,
  selectVisibleEdges,
  type CollabNode,
  type CollabEdge,
  type CollabField,
  type OperationDraft,
} from "../../stores/diagramCollabStore";

function toRenderedFields(fields?: CollabField[]): Field[] {
  return (fields || [])
    .filter((f) => !f.deleted)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

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
  const [generating, setGenerating] = useState(false);
  const [bgColorMode, setBgColorMode] = useState(false);
  const [currentBgColor, setCurrentBgColor] = useState("#63b3ed");
  const reactFlowContainerRef = useRef<HTMLDivElement>(null);
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    {},
  );

  const userId = getCurrentUser()?.id ?? "";
  const canUndo = useDiagramCollabStore((s) => s.undoStack.length > 0);
  const canRedo = useDiagramCollabStore((s) => s.redoStack.length > 0);

  const syncFromStore = useCallback(() => {
    const state = useDiagramCollabStore.getState();
    const visibleNodes = selectVisibleNodes(state);
    const visibleEdges = selectVisibleEdges(state);

    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));

      return visibleNodes.map((storeNode) => {
        const local = byId.get(storeNode.id);

        return {
          ...(local || {}),
          id: storeNode.id,
          type: storeNode.type,
          position: storeNode.position,
          style: storeNode.style,
          data: {
            ...storeNode.data,
            ...(storeNode.data.fields !== undefined
              ? { fields: toRenderedFields(storeNode.data.fields) }
              : {}),
          },
        } as CustomNode;
      });
    });

    setEdges((current) => {
      const byId = new Map(current.map((e) => [e.id, e]));

      return visibleEdges.map((storeEdge) => {
        const local = byId.get(storeEdge.id);

        return {
          ...(local || {}),
          id: storeEdge.id,
          source: storeEdge.source,
          sourceHandle: storeEdge.sourceHandle,
          target: storeEdge.target,
          label: storeEdge.label,
          type: storeEdge.type,
          data: storeEdge.data,
        } as CustomEdge;
      });
    });
  }, [setEdges, setNodes]);

  const sendOp = useCallback(
    (draft: OperationDraft) => {
      if (!userId) return;

      const op = useDiagramCollabStore.getState().stampOperation(draft, userId);
      useDiagramCollabStore.getState().applyOperation(op);
      realtimeService.sendOperation(op);
      syncFromStore();
    },
    [userId, syncFromStore],
  );

  const deleteEdgeWithCascade = useCallback(
    (edgeId: string) => {
      const edge = useDiagramCollabStore.getState().getEdge(edgeId);
      if (!edge) return;

      // junctionId is the real signal of "this edge belongs to an N:N pairing" —
      // both edges around a junction are tagged relationType "1:N", not "N:N".
      if (edge.data?.junctionId) {
        const junctionId = edge.data.junctionId;
        const siblingEdges = useDiagramCollabStore
          .getState()
          .edges.filter(
            (e) =>
              !e.data?.deleted &&
              e.id !== edgeId &&
              (e.source === junctionId || e.target === junctionId),
          );

        siblingEdges.forEach((sibling) =>
          sendOp({ type: "DELETE_EDGE", targetId: sibling.id }),
        );
        sendOp({ type: "DELETE_EDGE", targetId: edgeId });
        sendOp({ type: "DELETE_NODE", targetId: junctionId });
        return;
      }

      if (
        edge.data?.relationType === "1:1" ||
        edge.data?.relationType === "1:N"
      ) {
        const targetNodeId = edge.data?.targetNodeId ?? edge.target;
        const sourceNodeId = edge.data?.sourceNodeId ?? edge.source;
        const targetNode = useDiagramCollabStore.getState().getNode(targetNodeId);
        const sourceNode = useDiagramCollabStore.getState().getNode(sourceNodeId);
        const sourceName = sourceNode?.data.name || sourceNodeId;
        const fkFieldName = edge.data?.fkFieldName;

        const fkField = (targetNode?.data.fields || []).find(
          (f) =>
            !f.deleted &&
            f.fk &&
            (fkFieldName ? f.name === fkFieldName : f.name === `fk_${sourceName}_id`),
        );

        if (fkField && targetNode) {
          sendOp({
            type: "REMOVE_FIELD",
            targetId: targetNode.id,
            payload: { fieldId: fkField.id },
          });
        }
      }

      sendOp({ type: "DELETE_EDGE", targetId: edgeId });
    },
    [sendOp],
  );

  const deleteNodeWithCascade = useCallback(
    (nodeId: string) => {
      const connectedEdges = useDiagramCollabStore
        .getState()
        .edges.filter(
          (e) => !e.data?.deleted && (e.source === nodeId || e.target === nodeId),
        );

      connectedEdges.forEach((edge) => deleteEdgeWithCascade(edge.id));
      sendOp({ type: "DELETE_NODE", targetId: nodeId });
    },
    [deleteEdgeWithCascade, sendOp],
  );

  const renameEntity = useCallback(
    (nodeId: string, value: string) => {
      const node = useDiagramCollabStore.getState().getNode(nodeId);
      if (!node || node.data.name === value) return;

      sendOp({
        type: "SET_NODE_NAME",
        targetId: nodeId,
        payload: { value },
        previousValue: node.data.name,
      });
    },
    [sendOp],
  );

  const onFieldsChange = useCallback(
    (nodeId: string, newFields: Field[]) => {
      const node = useDiagramCollabStore.getState().getNode(nodeId);
      if (!node) return;

      const oldFields = (node.data.fields || []) as CollabField[];
      const newById = new Map(newFields.map((f) => [f.id, f]));
      const oldById = new Map(oldFields.map((f) => [f.id, f]));

      oldFields.forEach((f) => {
        if (!newById.has(f.id)) {
          sendOp({
            type: "REMOVE_FIELD",
            targetId: nodeId,
            payload: { fieldId: f.id },
          });
        }
      });

      newFields.forEach((f, index) => {
        const old = oldById.get(f.id);

        if (!old) {
          sendOp({
            type: "ADD_FIELD",
            targetId: nodeId,
            payload: { ...f, order: index },
          });
          return;
        }

        (Object.keys(f) as (keyof Field)[]).forEach((key) => {
          if (key === "id") return;
          if (old[key] !== f[key]) {
            sendOp({
              type: "SET_FIELD_PROP",
              targetId: nodeId,
              payload: { fieldId: f.id, key, value: f[key] },
              previousValue: old[key],
            });
          }
        });

        const oldIndex = oldFields.findIndex((of) => of.id === f.id);
        const oldOrder = old.order ?? oldIndex;

        if (oldOrder !== index) {
          sendOp({
            type: "SET_FIELD_ORDER",
            targetId: nodeId,
            payload: { fieldId: f.id, order: index },
            previousValue: oldOrder,
          });
        }
      });
    },
    [sendOp],
  );

  const EntityNodeConnected = useCallback(
    (props: any) => (
      <EntityNode
        {...props}
        onDelete={() => deleteNodeWithCascade(props.id)}
        onRename={(value: string) => renameEntity(props.id, value)}
        onFieldsChange={(fields: Field[]) => onFieldsChange(props.id, fields)}
      />
    ),
    [deleteNodeWithCascade, renameEntity, onFieldsChange],
  );
  const NoteNodeConnected = useCallback(
    (props: any) => (
      <NoteNode {...props} onDelete={() => deleteNodeWithCascade(props.id)} />
    ),
    [deleteNodeWithCascade],
  );
  const SectionNodeConnected = useCallback(
    (props: any) => (
      <SectionNode {...props} onDelete={() => deleteNodeWithCascade(props.id)} />
    ),
    [deleteNodeWithCascade],
  );
  const TextNodeConnected = useCallback(
    (props: any) => (
      <TextNode {...props} onDelete={() => deleteNodeWithCascade(props.id)} />
    ),
    [deleteNodeWithCascade],
  );
  const nodeTypes = useMemo(
    () => ({
      entityNode: EntityNodeConnected,
      noteNode: NoteNodeConnected,
      sectionNode: SectionNodeConnected,
      textNode: TextNodeConnected,
    }),
    [
      EntityNodeConnected,
      NoteNodeConnected,
      SectionNodeConnected,
      TextNodeConnected,
    ],
  );

  const edgeTypes = useMemo(() => ({ floating: FloatingEdge }), []);

  const handleUndo = useCallback(() => {
    const op = useDiagramCollabStore.getState().undo(userId);
    if (op) {
      realtimeService.sendOperation(op);
      syncFromStore();
    }
  }, [userId, syncFromStore]);

  const handleRedo = useCallback(() => {
    const op = useDiagramCollabStore.getState().redo(userId);
    if (op) {
      realtimeService.sendOperation(op);
      syncFromStore();
    }
  }, [userId, syncFromStore]);

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

        useDiagramCollabStore
          .getState()
          .loadDocument(loadedNodes as CollabNode[], loadedEdges as CollabEdge[]);

        const token = getToken();

        if (token && userId) {
          realtimeService.connect({
            diagramId: id,
            token,
            onOperation: (operation) => {
              useDiagramCollabStore.getState().applyOperation(operation);
              syncFromStore();
            },
            onPresence: () => {},
            onCursor: () => {},
            onError: (error) => messageApi.error(error.message),
          });
        }
      } catch (error: any) {
        const errorMessage = error?.response?.data?.message;
        messageApi.error(
          errorMessage || "Nao foi possivel carregar o diagrama",
        );
      }
    };

    loadDiagram();

    return () => {
      realtimeService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
    setOpenRelationModal(true);
  }, []);

  const onSelectRelationType = (relationType: "1:1" | "1:N" | "N:N") => {
    if (!pendingConnection) return;

    const targetNodeId = pendingConnection.target as string;
    const sourceNodeId = pendingConnection.source as string;

    const sourceNode = useDiagramCollabStore.getState().getNode(sourceNodeId);
    const targetNode = useDiagramCollabStore.getState().getNode(targetNodeId);

    const sourceName = sourceNode?.data.name || sourceNodeId;
    const targetName = targetNode?.data.name || targetNodeId;

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
        order: 0,
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
        order: 1,
      };

      const sx = sourceNode?.position.x ?? 250;
      const sy = sourceNode?.position.y ?? 150;
      const tx = targetNode?.position.x ?? 250;
      const ty = targetNode?.position.y ?? 150;

      const junctionNode = {
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

      sendOp({ type: "ADD_NODE", targetId: junctionId, payload: junctionNode });

      const edge1 = {
        id: crypto.randomUUID(),
        source: sourceNodeId,
        target: junctionId,
        label: "1:N",
        type: "floating",
        data: {
          relationType: "1:N" as const,
          sourceNodeId,
          targetNodeId,
          junctionId,
        },
      };

      const edge2 = {
        id: crypto.randomUUID(),
        source: junctionId,
        target: targetNodeId,
        label: "1:N",
        type: "floating",
        data: {
          relationType: "1:N" as const,
          sourceNodeId,
          targetNodeId,
          junctionId,
        },
      };

      sendOp({ type: "ADD_EDGE", targetId: edge1.id, payload: edge1 });
      sendOp({ type: "ADD_EDGE", targetId: edge2.id, payload: edge2 });
    } else {
      const edgeId = crypto.randomUUID();

      const edge = {
        id: edgeId,
        source: sourceNodeId,
        sourceHandle: pendingConnection.sourceHandle ?? undefined,
        target: targetNodeId,
        targetHandle: pendingConnection.targetHandle ?? undefined,
        label: relationType,
        type: "floating",
        data: {
          relationType,
          sourceNodeId,
          targetNodeId,
          fkFieldName: `fk_${sourceName}_id`,
        },
      };

      sendOp({ type: "ADD_EDGE", targetId: edgeId, payload: edge });

      const newField = {
        id: crypto.randomUUID(),
        name: `fk_${sourceName}_id`,
        type: "INT",
        pk: false,
        fk: true,
        notNull: false,
        unique: false,
        ai: false,
        order: targetNode?.data.fields?.length ?? 0,
      };

      sendOp({ type: "ADD_FIELD", targetId: targetNodeId, payload: newField });
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

      useDiagramCollabStore
        .getState()
        .patchNodeData(node.id, { bgColor: currentBgColor });
      syncFromStore();
    },
    [bgColorMode, currentBgColor, syncFromStore],
  );

  const onPatchSelectedTextNodes = useCallback(
    (patch: Record<string, unknown>) => {
      nodes.forEach((n) => {
        if (n.selected && (n.type === "textNode" || n.type === "noteNode")) {
          useDiagramCollabStore.getState().patchNodeData(n.id, patch);
        }
      });
      syncFromStore();
    },
    [nodes, syncFromStore],
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
    const newNode = {
      id: crypto.randomUUID(),
      type: "textNode",
      position: getNewNodePosition(),
      data: { text: "" },
    };
    sendOp({ type: "ADD_NODE", targetId: newNode.id, payload: newNode });
  }, [sendOp, getNewNodePosition]);

  const addSectionNode = useCallback(() => {
    const newNode = {
      id: crypto.randomUUID(),
      type: "sectionNode",
      position: getNewNodePosition(),
      style: { width: 300, height: 200, zIndex: -1 },
      data: { label: "Seção" },
    };
    sendOp({ type: "ADD_NODE", targetId: newNode.id, payload: newNode });
  }, [sendOp, getNewNodePosition]);

  const addNoteNode = useCallback(() => {
    const newNode = {
      id: crypto.randomUUID(),
      type: "noteNode",
      position: getNewNodePosition(),
      data: { text: "" },
    };
    sendOp({ type: "ADD_NODE", targetId: newNode.id, payload: newNode });
  }, [sendOp, getNewNodePosition]);

  const addEntityNode = useCallback(() => {
    const newNode = {
      id: crypto.randomUUID(),
      type: "entityNode",
      position: getNewNodePosition(),
      data: {
        name: "Entidade",
        fields: [],
      },
    };
    sendOp({ type: "ADD_NODE", targetId: newNode.id, payload: newNode });
  }, [sendOp, getNewNodePosition]);

  const onNodeDragStart = useCallback((_: any, node: CustomNode) => {
    dragStartPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
    };
  }, []);

  const onNodeDragStop = useCallback(
    (_: any, node: CustomNode) => {
      const previousPosition = dragStartPositionsRef.current[node.id];
      delete dragStartPositionsRef.current[node.id];

      if (
        previousPosition &&
        previousPosition.x === node.position.x &&
        previousPosition.y === node.position.y
      ) {
        return;
      }

      sendOp({
        type: "MOVE_NODE",
        targetId: node.id,
        payload: { x: node.position.x, y: node.position.y },
        previousPosition: previousPosition ?? node.position,
      });
    },
    [sendOp],
  );

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

  const captureThumbnail = async (): Promise<Blob | undefined> => {
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

      return blob ?? undefined;
    } catch {
      return undefined;
    }
  };

  const handleSave = useCallback(async () => {
    if (!id) return;

    setSaving(true);

    try {
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
      });

      const thumbnail = await captureThumbnail();

      if (thumbnail) {
        const formData = new FormData();
        formData.append("thumbnail", thumbnail, "thumbnail.jpg");
        await api.put(`/diagram/${id}/thumbnail`, formData);
      }

      messageApi.success("Diagrama salvo com sucesso");
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message;
      messageApi.error(errorMessage || "Não foi possível salvar o diagrama");
    } finally {
      setSaving(false);
    }
  }, [diagramName, edges, id, messageApi, nodes]);

  const handleGenerate = useCallback(
    async (prompt: string) => {
      setGenerating(true);

      try {
        const token = getToken();
        const { data } = await api.post(
          "/openai/generate-diagram",
          {
            description: prompt,
            diagramName,
            nodes,
            edges,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        const generatedNodes = Array.isArray(data?.nodes) ? data.nodes : [];
        const generatedEdges = Array.isArray(data?.edges) ? data.edges : [];

        setDiagramName(data?.diagramName || diagramName);
        setNodes(generatedNodes);
        setEdges(generatedEdges);

        useDiagramCollabStore
          .getState()
          .loadDocument(generatedNodes, generatedEdges);

        messageApi.success("Diagrama gerado com sucesso");
      } catch (error: any) {
        const errorMessage = error?.response?.data?.message;
        messageApi.error(errorMessage || "Não foi possível gerar o diagrama");
      } finally {
        setGenerating(false);
      }
    },
    [diagramName, edges, messageApi, nodes, setEdges, setNodes],
  );

  // Import substitui o diagrama inteiro — não é uma operação CRDT granular,
  // então não é transmitida em tempo real para outros colaboradores (apenas
  // reflete localmente e reresseta o histórico de undo/redo, como um "novo documento").
  const setNodesCompat = useCallback<Dispatch<SetStateAction<CustomNode[]>>>(
    (updater) => {
      setNodes((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (n: CustomNode[]) => CustomNode[])(current)
            : updater;

        useDiagramCollabStore
          .getState()
          .loadDocument(
            next as unknown as CollabNode[],
            useDiagramCollabStore.getState().edges,
          );

        return next;
      });
    },
    [setNodes],
  );

  const setEdgesCompat = useCallback<Dispatch<SetStateAction<CustomEdge[]>>>(
    (updater) => {
      setEdges((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (e: CustomEdge[]) => CustomEdge[])(current)
            : updater;

        useDiagramCollabStore
          .getState()
          .loadDocument(
            useDiagramCollabStore.getState().nodes,
            next as unknown as CollabEdge[],
          );

        return next;
      });
    },
    [setEdges],
  );

  return (
    <Layout
      style={{
        margin: 0,
        padding: 0,
        height: "100vh",
        overflow: "hidden",
      }}
    >
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
        setNodes={setNodesCompat}
        setEdges={setEdgesCompat}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBeforeImportReplace={() => {}}
        onPatchSelectedTextNodes={onPatchSelectedTextNodes}
        bgColorActive={bgColorMode}
        bgColor={currentBgColor}
        onBgColorChange={handleBgColorChange}
      />

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <SidebarConstructor
          onAddEntity={addEntityNode}
          onAddNote={addNoteNode}
          onAddSection={addSectionNode}
          onAddText={addTextNode}
          onGenerate={handleGenerate}
          generating={generating}
          diagramName={diagramName}
          nodes={nodes}
          edges={edges}
        />

        <div
          ref={reactFlowContainerRef}
          style={{
            flex: 1,
            minWidth: 0,
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
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            deleteKeyCode={null}
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
              onRemove={deleteEdgeWithCascade}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
