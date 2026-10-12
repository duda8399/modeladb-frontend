import { api } from "./api";

export type DiagramSummary = {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
};

export const diagramsService = {
  async rename(id: string, name: string): Promise<DiagramSummary> {
    const { data } = await api.patch<DiagramSummary>(`/diagram/${id}`, { name });
    return data;
  },

  async duplicate(id: string, name?: string): Promise<DiagramSummary> {
    const { data } = await api.post<DiagramSummary>(`/diagram/${id}/duplicate`, name ? { name } : {});
    return data;
  },
};
