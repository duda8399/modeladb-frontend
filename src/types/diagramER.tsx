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
  size?: string | null;
  defaultValue?: string | null;
}

export interface CustomNode extends Node {
  fields?: Field[];
}

export type FkAction = "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT" | "NO ACTION";

export type CustomEdge = Edge & {
  data?: {
    relationType: "1:1" | "1:N" | "N:N";
    sourceNodeId?: string;
    targetNodeId?: string;
    junctionId?: string;
    fkFieldName?: string;
    onDelete?: FkAction | null;
    onUpdate?: FkAction | null;
  };
};

export interface TableIndex {
  id: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ViewNodeData {
  name: string;
  sql: string;
}

export interface TableCheck {
  id: string;
  name: string;
  expression: string;
}
