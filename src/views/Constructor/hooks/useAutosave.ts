import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { message } from "antd";
import { api } from "../../../services/api";
import type { CustomEdge, CustomNode } from "../../../types/diagramER";
import type { SaveStatus } from "../EditorToolbar";

type MessageInstance = ReturnType<typeof message.useMessage>[0];

const AUTOSAVE_DELAY_MS = 2000;
const THUMBNAIL_INTERVAL_MS = 30000;

type Params = {
  diagramId?: string;
  diagramName: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
  loaded: boolean;
  readOnly: boolean;
  messageApi: MessageInstance;
  captureThumbnail: () => Promise<Blob | undefined>;
  onSaveStart?: () => number;
  onSaveSuccess?: (token: number) => void;
};

export function buildSavePayload(diagramName: string, nodes: CustomNode[], edges: CustomEdge[]) {
  return {
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
  };
}

export type SavePayload = ReturnType<typeof buildSavePayload>;

export function useAutosave({
  diagramId,
  diagramName,
  nodes,
  edges,
  loaded,
  readOnly,
  messageApi,
  captureThumbnail,
  onSaveStart,
  onSaveSuccess,
}: Params) {
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const savePayload = useMemo(() => buildSavePayload(diagramName, nodes, edges), [diagramName, nodes, edges]);
  const saveSignature = useMemo(() => JSON.stringify(savePayload), [savePayload]);

  const savePayloadRef = useRef(savePayload);
  const saveSignatureRef = useRef(saveSignature);
  const savedSignatureRef = useRef(savedSignature);
  const readOnlyRef = useRef(readOnly);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const lastThumbnailAtRef = useRef(0);
  const callbacksRef = useRef({ captureThumbnail, onSaveStart, onSaveSuccess });

  useLayoutEffect(() => {
    savePayloadRef.current = savePayload;
    saveSignatureRef.current = saveSignature;
    savedSignatureRef.current = savedSignature;
    readOnlyRef.current = readOnly;
    callbacksRef.current = { captureThumbnail, onSaveStart, onSaveSuccess };
  });

  const isDirty = loaded && savedSignature !== null && saveSignature !== savedSignature;

  const hasPendingChanges = () =>
    savedSignatureRef.current !== null && saveSignatureRef.current !== savedSignatureRef.current;

  const resetBaseline = useCallback(() => setSavedSignature(null), []);

  useEffect(() => {
    setSavedSignature(null);
    setSaveStatus("idle");
  }, [diagramId]);

  const persistDiagram = useCallback(
    async ({ manual }: { manual: boolean }) => {
      if (!diagramId) return;

      if (saveInFlightRef.current) {
        if (!manual) return;
        await saveInFlightRef.current;
      }

      const payload = savePayloadRef.current;
      const signature = saveSignatureRef.current;
      const token = callbacksRef.current.onSaveStart?.() ?? 0;

      const run = async () => {
        if (manual) setSaving(true);
        setSaveStatus("saving");

        try {
          await api.put(`/diagram/${diagramId}`, payload);

          callbacksRef.current.onSaveSuccess?.(token);
          setSavedSignature(signature);
          setLastSavedAt(new Date());
          setSaveStatus("saved");

          if (manual || Date.now() - lastThumbnailAtRef.current >= THUMBNAIL_INTERVAL_MS) {
            lastThumbnailAtRef.current = Date.now();
            const thumbnail = await callbacksRef.current.captureThumbnail();

            if (thumbnail) {
              const formData = new FormData();
              formData.append("thumbnail", thumbnail, "thumbnail.jpg");
              await api.put(`/diagram/${diagramId}/thumbnail`, formData);
            }
          }

          if (manual) messageApi.success("Diagrama salvo com sucesso");
        } catch (error) {
          setSaveStatus("error");
          const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
          messageApi.error(
            errorMessage ||
              (manual ? "Não foi possível salvar o diagrama" : "Não foi possível salvar automaticamente"),
          );
        } finally {
          if (manual) setSaving(false);
        }
      };

      const promise = run();
      saveInFlightRef.current = promise;
      await promise;
      saveInFlightRef.current = null;
    },
    [diagramId, messageApi],
  );

  const handleSave = useCallback(() => persistDiagram({ manual: true }), [persistDiagram]);

  const flushPendingSave = useCallback(async () => {
    if (saveInFlightRef.current) await saveInFlightRef.current;
    if (hasPendingChanges() && !readOnlyRef.current) await persistDiagram({ manual: false });
  }, [persistDiagram]);

  useEffect(() => {
    if (loaded && savedSignature === null) setSavedSignature(saveSignature);
  }, [loaded, savedSignature, saveSignature]);

  useEffect(() => {
    if (!isDirty || readOnly) return;

    setSaveStatus((prev) => (prev === "saving" ? prev : "pending"));

    const timer = setTimeout(() => persistDiagram({ manual: false }), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, readOnly, saveSignature, persistDiagram]);

  useEffect(() => {
    if (!isDirty || readOnly) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, readOnly]);

  useEffect(() => {
    return () => {
      if (diagramId && hasPendingChanges() && !readOnlyRef.current) {
        api.put(`/diagram/${diagramId}`, savePayloadRef.current).catch(() => {});
      }
    };
  }, [diagramId]);

  return {
    saving,
    saveStatus,
    setSaveStatus,
    lastSavedAt,
    setLastSavedAt,
    isDirty,
    savePayload,
    savePayloadRef,
    handleSave,
    flushPendingSave,
    resetBaseline,
  };
}
