import { api } from "./api";
import type { CustomEdge, CustomNode } from "../types/diagramER";

export type VersionKind = "AUTO" | "MANUAL" | "RESTORE";

export type VersionSummary = {
  id: string;
  diagramId: string;
  name: string;
  label: string | null;
  kind: VersionKind;
  tableCount: number;
  viewCount: number;
  relationCount: number;
  createdById: string | null;
  createdByName: string | null;
  restoredFromId: string | null;
  createdAt: string;
};

export type VersionDetail = VersionSummary & { nodes: CustomNode[]; edges: CustomEdge[] };

export type RestoredDiagram = {
  name: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
  currentUserRole?: "OWNER" | "EDITOR" | "VIEWER" | null;
};

const base = (diagramId: string) => `/diagram/${diagramId}/versions`;

export const versionsService = {
  list: async (diagramId: string) => (await api.get<VersionSummary[]>(base(diagramId))).data,
  get: async (diagramId: string, versionId: string) =>
    (await api.get<VersionDetail>(`${base(diagramId)}/${versionId}`)).data,
  create: async (diagramId: string, label: string) =>
    (await api.post<VersionSummary>(base(diagramId), { label })).data,
  rename: async (diagramId: string, versionId: string, label: string) =>
    (await api.patch<VersionSummary>(`${base(diagramId)}/${versionId}`, { label })).data,
  remove: async (diagramId: string, versionId: string) => {
    await api.delete(`${base(diagramId)}/${versionId}`);
  },
  restore: async (diagramId: string, versionId: string) =>
    (await api.post<RestoredDiagram>(`${base(diagramId)}/${versionId}/restore`)).data,
};
