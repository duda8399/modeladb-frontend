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
  getNodesBounds,
  useReactFlow,
} from "reactflow";
import { Button, Layout, Modal, message } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { SidebarConstructor } from "./SidebarConstructor";
import { EditorToolbar } from "./EditorToolbar";
import { Navbar } from "../../components/LayoutComponents/Navbar";
import RelationModal from "../../components/ConstructorComponents/RelationModal";
import ShareModal from "../../components/ConstructorComponents/ShareModal";
import { EdgeActionsContext } from "../../components/ConstructorComponents/EdgeActionsContext";
import FloatingEdge from "../../components/ConstructorComponents/FloatingEdge";
import ViewEdge from "../../components/ConstructorComponents/ViewEdge";
import VersionHistoryDrawer from "../../components/ConstructorComponents/VersionHistoryDrawer";
import AiAnalysisDrawer from "../../components/ConstructorComponents/AiAnalysisDrawer";
import RelationshipModal, { type RelationshipDetails } from "../../components/ConstructorComponents/RelationshipModal";
import { RemoteCursors } from "../../components/ConstructorComponents/RemoteCursors";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { findTable, planSuggestion, type AiAnalysis, type AiSuggestion } from "../../utils/aiSuggestions";
import { buildViewEdges, viewSources, type ViewSource } from "../../utils/viewEdges";
import { buildRelationshipOps, type RelationType } from "../../utils/relationshipOps";
import { normalizeLoadedEdges } from "../../utils/loadedDiagram";
import { versionsService } from "../../services/versionsService";
import { api } from "../../services/api";
import realtimeService, { type DocumentRestoredEvent } from "../../services/realtimeService";
import { getCurrentUser } from "../../utils/auth";
import type { CustomEdge, CustomNode } from "../../types/diagramER";
import {
  useDiagramCollabStore,
  type CollabEdge,
  type CollabNode,
  type Operation,
} from "../../stores/diagramCollabStore";
import { useDiagramOperations } from "./hooks/useDiagramOperations";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import { useAutosave } from "./hooks/useAutosave";
import { useNodeFactory } from "./hooks/useNodeFactory";
import { useNodeTypes } from "./hooks/useNodeTypes";

type UserRole = "OWNER" | "EDITOR" | "VIEWER";

type ServerDiagram = {
  name?: string;
  nodes?: CustomNode[];
  edges?: CustomEdge[];
  currentUserRole?: UserRole | null;
};

const MAX_TRACKED_OWN_OPS = 5000;
const EDGE_TYPES = { floating: FloatingEdge, viewEdge: ViewEdge };

const ConstructorPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const { getNodes, screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CustomEdge>([]);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [openRelationModal, setOpenRelationModal] = useState(false);
  const [diagramName, setDiagramName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bgColorMode, setBgColorMode] = useState(false);
  const [currentBgColor, setCurrentBgColor] = useState("#63b3ed");
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [accessLost, setAccessLost] = useState<"removed" | "deleted" | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(() => new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const ownRestoreRef = useRef<string | null>(null);
  const unsavedOwnOpsRef = useRef<Operation[]>([]);
  const reactFlowContainerRef = useRef<HTMLDivElement>(null);
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const userId = getCurrentUser()?.id ?? "";
  const notifyPanelError = useCallback(
    () => messageApi.error("Um painel do editor falhou e foi fechado. O diagrama continua disponível."),
    [messageApi],
  );
  const isOwner = currentUserRole === "OWNER";
  const isViewer = currentUserRole === "VIEWER";
  const canUndo = useDiagramCollabStore((s) => s.undoStack.length > 0) && !isViewer;
  const canRedo = useDiagramCollabStore((s) => s.redoStack.length > 0) && !isViewer;

  const emitOperation = useCallback((op: Operation) => {
    const tracked = unsavedOwnOpsRef.current;
    tracked.push(op);
    if (tracked.length > MAX_TRACKED_OWN_OPS) tracked.splice(0, tracked.length - MAX_TRACKED_OWN_OPS);
    realtimeService.sendOperation(op);
  }, []);

  const ops = useDiagramOperations({
    userId,
    readOnly: isViewer,
    emitOperation,
    setNodes,
    setEdges,
  });

  const { addEntityNode, addTextNode, addSectionNode, addNoteNode, addViewNode } = useNodeFactory(ops.sendOp);

  const nodeTypes = useNodeTypes({
    deleteNode: ops.deleteNodeWithCascade,
    setNodeProp: ops.setNodeProp,
    resizeNode: ops.resizeNode,
    onFieldsChange: ops.onFieldsChange,
  });

  const captureThumbnail = useCallback(async (): Promise<Blob | undefined> => {
    const flow = reactFlowContainerRef.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!flow) return undefined;

    try {
      const bounds = getNodesBounds(getNodes());
      const canvas = await html2canvas(flow, {
        backgroundColor: "#fff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: bounds.width + 200,
        height: bounds.height + 200,
        x: bounds.x - 100,
        y: bounds.y - 100,
        windowWidth: bounds.width + 200,
        windowHeight: bounds.height + 200,
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.4));
      return blob ?? undefined;
    } catch {
      return undefined;
    }
  }, [getNodes]);

  const autosave = useAutosave({
    diagramId: id,
    diagramName,
    nodes,
    edges,
    loaded,
    readOnly: isViewer,
    messageApi,
    captureThumbnail,
    onSaveStart: () => unsavedOwnOpsRef.current.length,
    onSaveSuccess: (count) => {
      unsavedOwnOpsRef.current.splice(0, count);
    },
  });

  const { resetBaseline } = autosave;

  const applyServerDiagram = useCallback(
    (data: ServerDiagram) => {
      const loadedNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const loadedEdges = normalizeLoadedEdges(loadedNodes, Array.isArray(data?.edges) ? data.edges : []);

      setDiagramName(data?.name || "");
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setCurrentUserRole(data?.currentUserRole ?? null);
      resetBaseline();

      useDiagramCollabStore
        .getState()
        .loadDocument(loadedNodes as CollabNode[], loadedEdges as CollabEdge[]);
    },
    [setNodes, setEdges, resetBaseline],
  );

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoaded(false);
    unsavedOwnOpsRef.current = [];

    api
      .get(`/diagram/${id}`)
      .then(({ data }) => {
        if (cancelled) return;
        applyServerDiagram(data);
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        messageApi.error(error?.response?.data?.message || "Nao foi possivel carregar o diagrama");
      });

    return () => {
      cancelled = true;
    };
  }, [id, applyServerDiagram, messageApi]);

  const resyncFromServer = useCallback(async () => {
    if (!id) return;

    try {
      const { data } = await api.get(`/diagram/${id}`);
      const replay = [...unsavedOwnOpsRef.current];
      const queued = new Set(realtimeService.getPendingOperations().map((op) => op.opId));

      applyServerDiagram(data);

      const store = useDiagramCollabStore.getState();
      replay.forEach((op) => store.applyOperation(op, false));
      ops.syncFromStore();
      replay.filter((op) => !queued.has(op.opId)).forEach((op) => realtimeService.sendOperation(op));

      messageApi.info("Conexão restabelecida. O diagrama foi atualizado com as alterações dos colaboradores.");
    } catch {
      messageApi.warning("Conexão restabelecida, mas não foi possível atualizar o diagrama. Recarregue a página.");
    }
  }, [id, applyServerDiagram, ops, messageApi]);

  const handleDocumentRestored = useCallback(
    async (event: DocumentRestoredEvent) => {
      if (!id || event.diagramId !== id) return;
      if (ownRestoreRef.current === event.versionId) {
        ownRestoreRef.current = null;
        return;
      }
      try {
        const { data } = await api.get(`/diagram/${id}`);
        unsavedOwnOpsRef.current = [];
        applyServerDiagram(data);
        messageApi.info(
          `${event.userName ?? "Um colaborador"} restaurou uma versão anterior. O diagrama foi atualizado.`,
        );
      } catch {
        messageApi.error("Uma versão foi restaurada, mas não foi possível recarregar o diagrama.");
      }
    },
    [id, applyServerDiagram, messageApi],
  );

  const realtime = useRealtimeSession({
    diagramId: id,
    userId,
    enabled: loaded,
    onRemoteOperation: ops.applyRemoteOperation,
    onResyncNeeded: resyncFromServer,
    onDocumentRestored: handleDocumentRestored,
    onError: (error) => messageApi.error(error.message),
    onDocumentRenamed: (event) => {
      if (event.diagramId !== id) return;
      setDiagramName(event.name);
      if (event.byUserId !== userId) messageApi.info(`O diagrama foi renomeado para "${event.name}".`);
    },
    onRoleChanged: (event) => {
      setCurrentUserRole(event.role);
      messageApi.info(
        event.role === "VIEWER"
          ? "Sua permissão mudou para Leitor. O diagrama agora está somente leitura."
          : "Sua permissão mudou para Editor. Agora você pode editar o diagrama.",
      );
    },
    onAccessRevoked: (event) => {
      if (event.reason === "left") return;
      setCurrentUserRole("VIEWER");
      realtime.disconnect();
      setAccessLost(event.reason);
    },
  });

  const viewSourcesKey = useMemo(() => JSON.stringify(viewSources(nodes)), [nodes]);
  const viewEdges = useMemo<CustomEdge[]>(
    () => buildViewEdges(JSON.parse(viewSourcesKey) as ViewSource[]),
    [viewSourcesKey],
  );
  const renderedEdges = useMemo(() => [...edges, ...viewEdges], [edges, viewEdges]);

  const edgeActions = useMemo(
    () => ({ onRemove: ops.deleteEdgeWithCascade, onEdit: setEditingEdgeId, readOnly: isViewer }),
    [ops.deleteEdgeWithCascade, isViewer],
  );

  const editingDetails = useMemo<RelationshipDetails | null>(() => {
    if (!editingEdgeId) return null;
    const edge = useDiagramCollabStore.getState().getEdge(editingEdgeId);
    if (!edge?.data) return null;

    const { childNode, parentNode, fkField } = ops.findFkField(edge);
    return {
      relationType: edge.data.relationType ?? "1:N",
      parentTable: parentNode?.data.name ?? "?",
      childTable: childNode?.data.name ?? "?",
      fkColumn: fkField?.name ?? edge.data.fkFieldName ?? null,
      isJunction: !!edge.data.junctionId,
      canChangeParticipation: !edge.data.junctionId && !!fkField && !fkField.pk,
      required: edge.data.junctionId ? true : !!fkField && (fkField.notNull || fkField.pk),
      onDelete: edge.data.onDelete ?? null,
      onUpdate: edge.data.onUpdate ?? null,
    };
  }, [editingEdgeId, ops]);

  const onCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => realtime.sendCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY })),
    [realtime, screenToFlowPosition],
  );

  const onConnect = useCallback((params: Connection) => {
    setPendingConnection(params);
    setOpenRelationModal(true);
  }, []);

  const onSelectRelationType = (relationType: RelationType) => {
    if (!pendingConnection) return;

    const store = useDiagramCollabStore.getState();
    const sourceId = pendingConnection.source as string;
    const targetId = pendingConnection.target as string;

    buildRelationshipOps(
      relationType,
      { id: sourceId, node: store.getNode(sourceId), handle: pendingConnection.sourceHandle },
      { id: targetId, node: store.getNode(targetId), handle: pendingConnection.targetHandle },
    ).forEach(ops.sendOp);

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
      ops.setNodeProp(node.id, "bgColor", currentBgColor);
    },
    [bgColorMode, currentBgColor, ops],
  );

  const onPatchSelectedTextNodes = useCallback(
    (patch: Record<string, unknown>) => {
      nodes
        .filter((n) => n.selected && (n.type === "textNode" || n.type === "noteNode"))
        .forEach((n) => Object.entries(patch).forEach(([key, value]) => ops.setNodeProp(n.id, key, value)));
    },
    [nodes, ops],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBgColorMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: CustomNode) => {
    dragStartPositionsRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: CustomNode) => {
      const previousPosition = dragStartPositionsRef.current[node.id];
      delete dragStartPositionsRef.current[node.id];
      ops.moveNode(node.id, node.position, previousPosition);
    },
    [ops],
  );

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!id) return;
      try {
        await autosave.flushPendingSave();
        ownRestoreRef.current = versionId;
        const restored = await versionsService.restore(id, versionId);
        unsavedOwnOpsRef.current = [];
        applyServerDiagram(restored);
        autosave.setSaveStatus("saved");
        autosave.setLastSavedAt(new Date());
        messageApi.success("Versão restaurada. O estado anterior ficou guardado no histórico.");
      } catch (error) {
        const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        messageApi.error(serverMessage || "Não foi possível restaurar a versão.");
        throw error;
      }
    },
    [id, autosave, applyServerDiagram, messageApi],
  );

  const runAnalysis = useCallback(
    async (focus: string) => {
      setAnalyzing(true);
      setAnalysisError(null);
      try {
        const { data } = await api.post<AiAnalysis>("/openai/analyze-diagram", {
          diagramName,
          nodes: autosave.savePayloadRef.current.nodes,
          edges: autosave.savePayloadRef.current.edges,
          focus,
        });
        setAnalysis(data);
        setAppliedSuggestions(new Set());
        setDismissedSuggestions(new Set());
      } catch (error) {
        const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setAnalysisError(serverMessage || "Não foi possível analisar o modelo.");
      } finally {
        setAnalyzing(false);
      }
    },
    [diagramName, autosave.savePayloadRef],
  );

  const applySuggestion = useCallback(
    (suggestion: AiSuggestion) => {
      if (!suggestion.action) return;
      const { nodes: storeNodes, edges: storeEdges } = useDiagramCollabStore.getState();
      const plan = planSuggestion(suggestion.action, storeNodes, storeEdges);
      if ("error" in plan) {
        messageApi.warning(plan.error);
        return;
      }
      plan.ops.forEach((op) => ops.sendOp(op));
      setAppliedSuggestions((current) => new Set(current).add(suggestion.id));
      messageApi.success("Sugestão aplicada. Use Desfazer para reverter.");
    },
    [messageApi, ops],
  );

  const locateSuggestion = useCallback(
    (suggestion: AiSuggestion) => {
      const table = findTable(useDiagramCollabStore.getState().nodes, suggestion.table);
      if (!table) {
        messageApi.info(`A tabela ${suggestion.table} não está no diagrama.`);
        return;
      }
      fitView({ nodes: [{ id: table.id }], duration: 400, maxZoom: 1.2, padding: 0.6 });
    },
    [fitView, messageApi],
  );

  const currentSnapshot = useMemo(
    () => ({
      name: diagramName,
      nodes: autosave.savePayload.nodes as CustomNode[],
      edges: autosave.savePayload.edges as CustomEdge[],
    }),
    [diagramName, autosave.savePayload],
  );

  const replaceDocument = useCallback(
    (nextNodes: CustomNode[], nextEdges: CustomEdge[]) => {
      unsavedOwnOpsRef.current = [];
      useDiagramCollabStore
        .getState()
        .loadDocument(nextNodes as unknown as CollabNode[], nextEdges as unknown as CollabEdge[]);
    },
    [],
  );

  const handleGenerate = useCallback(
    async (prompt: string): Promise<boolean> => {
      setGenerating(true);

      try {
        const { data } = await api.post("/openai/generate-diagram", {
          description: prompt,
          diagramName,
          nodes,
          edges,
        });

        const generatedNodes = Array.isArray(data?.nodes) ? data.nodes : [];
        const generatedEdges = Array.isArray(data?.edges) ? data.edges : [];

        setDiagramName(data?.diagramName || diagramName);
        setNodes(generatedNodes);
        setEdges(generatedEdges);
        replaceDocument(generatedNodes, generatedEdges);

        messageApi.success("Diagrama gerado com sucesso");
        return true;
      } catch (error) {
        const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        messageApi.error(serverMessage || "Não foi possível gerar o diagrama");
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [diagramName, edges, messageApi, nodes, setEdges, setNodes, replaceDocument],
  );

  const setNodesCompat = useCallback<Dispatch<SetStateAction<CustomNode[]>>>(
    (updater) => {
      setNodes((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        replaceDocument(next, useDiagramCollabStore.getState().edges as unknown as CustomEdge[]);
        return next;
      });
    },
    [setNodes, replaceDocument],
  );

  const setEdgesCompat = useCallback<Dispatch<SetStateAction<CustomEdge[]>>>(
    (updater) => {
      setEdges((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        replaceDocument(useDiagramCollabStore.getState().nodes as unknown as CustomNode[], next);
        return next;
      });
    },
    [setEdges, replaceDocument],
  );

  return (
    <Layout style={{ margin: 0, padding: 0, height: "100vh", overflow: "hidden" }}>
      {contextHolder}
      <Modal
        open={accessLost !== null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        title={accessLost === "deleted" ? "Diagrama excluído" : "Acesso removido"}
        footer={
          <Button type="primary" onClick={() => navigate(accessLost === "deleted" ? "/" : "/shared")}>
            Voltar
          </Button>
        }
      >
        {accessLost === "deleted"
          ? "O dono excluiu este diagrama. As alterações feitas a partir de agora não serão salvas."
          : "O dono removeu o seu acesso a este diagrama. As alterações feitas a partir de agora não serão salvas."}
      </Modal>
      <RelationModal
        open={openRelationModal}
        onCancel={() => setOpenRelationModal(false)}
        onSelect={onSelectRelationType}
      />

      <ErrorBoundary
        key={`${analysisOpen}-${historyOpen}-${editingEdgeId}-${showShareModal}`}
        fallback={null}
        onError={notifyPanelError}
      >
      <AiAnalysisDrawer
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        analysis={analysis}
        analyzing={analyzing}
        error={analysisError}
        canApply={!isViewer}
        applied={appliedSuggestions}
        dismissed={dismissedSuggestions}
        onAnalyze={runAnalysis}
        onApply={applySuggestion}
        onDismiss={(suggestion) => setDismissedSuggestions((current) => new Set(current).add(suggestion.id))}
        onShowDismissed={() => setDismissedSuggestions(new Set())}
        onLocate={locateSuggestion}
      />

      {id && (
        <VersionHistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          diagramId={id}
          canEdit={!isViewer}
          isOwner={isOwner}
          current={currentSnapshot}
          onBeforeSnapshot={autosave.flushPendingSave}
          onRestore={restoreVersion}
        />
      )}

      {editingEdgeId && editingDetails && (
        <RelationshipModal
          key={editingEdgeId}
          details={editingDetails}
          readOnly={isViewer}
          onClose={() => setEditingEdgeId(null)}
          onSave={(changes) => ops.saveRelationship(editingEdgeId, changes)}
        />
      )}

      {id && (
        <ShareModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          diagramId={id}
          isOwner={isOwner}
          currentUserId={userId}
        />
      )}
      </ErrorBoundary>

      <Navbar />
      <EditorToolbar
        diagramName={diagramName}
        onDiagramNameChange={setDiagramName}
        onSave={autosave.handleSave}
        saving={autosave.saving}
        saveStatus={isViewer ? "idle" : autosave.saveStatus}
        lastSavedAt={autosave.lastSavedAt}
        nodes={nodes}
        edges={edges}
        setNodes={setNodesCompat}
        setEdges={setEdgesCompat}
        onUndo={ops.handleUndo}
        onRedo={ops.handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBeforeImportReplace={() => {}}
        onPatchSelectedTextNodes={onPatchSelectedTextNodes}
        onlineUsers={Object.values(realtime.onlineUsers)}
        connectionStatus={realtime.status}
        pendingOperations={realtime.pendingCount}
        onOpenShare={() => setShowShareModal(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        readOnly={isViewer}
        bgColorActive={bgColorMode}
        bgColor={currentBgColor}
        onBgColorChange={handleBgColorChange}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <SidebarConstructor
          onAddEntity={addEntityNode}
          onAnalyze={() => setAnalysisOpen(true)}
          onAddView={addViewNode}
          onAddNote={addNoteNode}
          onAddSection={addSectionNode}
          onAddText={addTextNode}
          onGenerate={handleGenerate}
          generating={generating}
          diagramName={diagramName}
          onDiagramNameChange={setDiagramName}
          nodes={nodes}
          edges={edges}
          readOnly={isViewer}
        />

        <div
          ref={reactFlowContainerRef}
          onMouseMove={onCanvasMouseMove}
          style={{
            flex: 1,
            minWidth: 0,
            position: "relative",
            cursor: bgColorMode ? "crosshair" : undefined,
          }}
        >
          <EdgeActionsContext.Provider value={edgeActions}>
            <ReactFlow
              nodes={nodes}
              edges={renderedEdges}
              nodeTypes={nodeTypes}
              edgeTypes={EDGE_TYPES}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={!isViewer}
              nodesConnectable={!isViewer}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setBgColorMode(false)}
              deleteKeyCode={null}
              fitView
              defaultEdgeOptions={{
                style: { strokeWidth: 2 },
                labelStyle: { fill: "#333", fontWeight: 600 },
              }}
            >
              <Background />
              <Controls
                position="bottom-right"
                style={{ right: 210, bottom: 20 }}
                fitViewOptions={{ maxZoom: 1, padding: 0.2, duration: 300 }}
              />
              <MiniMap pannable zoomable nodeColor="gray" />
            </ReactFlow>
          </EdgeActionsContext.Provider>

          <RemoteCursors cursors={realtime.cursors} onlineUsers={realtime.onlineUsers} />
        </div>
      </div>
    </Layout>
  );
};

export default ConstructorPage;
