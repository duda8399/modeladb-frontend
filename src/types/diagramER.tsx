import { type Edge, type Node } from "reactflow";

export interface RemoveEdgeData {
  x: number;
  y: number;
  edgeId: string;
}

export interface Field {
  id: string;
  name: string | null;
  type: string | null;
  pk: boolean;
  fk: boolean;
  notNull: boolean;
  unique: boolean;
  ai: boolean;
}

export interface CustomNode extends Node {
  fields?: Field[];
}

export type CustomEdge = Edge & {
  data?: {
    relationType: "1:1" | "1:N" | "N:N";
    sourceNodeId?: string;
    targetNodeId?: string;
    junctionId?: string;
    fkFieldName?: string;
  };
};
