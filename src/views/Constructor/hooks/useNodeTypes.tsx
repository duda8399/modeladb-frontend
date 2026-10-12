import { useCallback, useMemo } from "react";
import type { NodeProps } from "reactflow";
import EntityNode from "../../../components/ConstructorComponents/EntityNode";
import NoteNode from "../../../components/ConstructorComponents/NoteNode";
import SectionNode from "../../../components/ConstructorComponents/SectionNode";
import TextNode from "../../../components/ConstructorComponents/TextNode";
import ViewNode from "../../../components/ConstructorComponents/ViewNode";
import type { Field, TableCheck, TableIndex, ViewNodeData } from "../../../types/diagramER";

type Actions = {
  deleteNode: (nodeId: string) => void;
  setNodeProp: (nodeId: string, key: string, value: unknown) => void;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  onFieldsChange: (nodeId: string, fields: Field[]) => void;
};

export function useNodeTypes({ deleteNode, setNodeProp, resizeNode, onFieldsChange }: Actions) {
  const EntityNodeConnected = useCallback(
    (props: NodeProps) => (
      <EntityNode
        {...props}
        onDelete={() => deleteNode(props.id)}
        onRename={(value: string) => setNodeProp(props.id, "name", value)}
        onFieldsChange={(fields: Field[]) => onFieldsChange(props.id, fields)}
        onIndexesChange={(indexes: TableIndex[]) => setNodeProp(props.id, "indexes", indexes)}
        onChecksChange={(checks: TableCheck[]) => setNodeProp(props.id, "checks", checks)}
        onDescriptionChange={(description: string | null) => setNodeProp(props.id, "description", description)}
      />
    ),
    [deleteNode, setNodeProp, onFieldsChange],
  );

  const ViewNodeConnected = useCallback(
    (props: NodeProps<ViewNodeData>) => (
      <ViewNode
        {...props}
        onDelete={() => deleteNode(props.id)}
        onRename={(value: string) => setNodeProp(props.id, "name", value)}
        onSqlChange={(sql: string) => setNodeProp(props.id, "sql", sql)}
      />
    ),
    [deleteNode, setNodeProp],
  );

  const NoteNodeConnected = useCallback(
    (props: NodeProps) => (
      <NoteNode
        {...props}
        onDelete={() => deleteNode(props.id)}
        onCommitText={(text: string) => setNodeProp(props.id, "text", text)}
        onResize={(width: number, height: number) => resizeNode(props.id, width, height)}
      />
    ),
    [deleteNode, setNodeProp, resizeNode],
  );

  const SectionNodeConnected = useCallback(
    (props: NodeProps) => (
      <SectionNode
        {...props}
        onDelete={() => deleteNode(props.id)}
        onCommitLabel={(label: string) => setNodeProp(props.id, "label", label)}
        onResize={(width: number, height: number) => resizeNode(props.id, width, height)}
      />
    ),
    [deleteNode, setNodeProp, resizeNode],
  );

  const TextNodeConnected = useCallback(
    (props: NodeProps) => (
      <TextNode
        {...props}
        onDelete={() => deleteNode(props.id)}
        onCommitText={(text: string) => setNodeProp(props.id, "text", text)}
        onResize={(width: number, height: number) => resizeNode(props.id, width, height)}
      />
    ),
    [deleteNode, setNodeProp, resizeNode],
  );

  return useMemo(
    () => ({
      entityNode: EntityNodeConnected,
      noteNode: NoteNodeConnected,
      sectionNode: SectionNodeConnected,
      textNode: TextNodeConnected,
      viewNode: ViewNodeConnected,
    }),
    [EntityNodeConnected, NoteNodeConnected, SectionNodeConnected, TextNodeConnected, ViewNodeConnected],
  );
}
