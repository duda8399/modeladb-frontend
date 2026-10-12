import type { CollabNode, OperationDraft } from "../stores/diagramCollabStore";

export type RelationType = "1:1" | "1:N" | "N:N";

type Endpoint = {
  id: string;
  node?: CollabNode;
  handle?: string | null;
};

const fkField = (id: string, name: string, order: number, primary: boolean) => ({
  id,
  name,
  type: "INT",
  pk: primary,
  fk: true,
  notNull: primary,
  unique: false,
  ai: false,
  order,
});

export function buildRelationshipOps(
  relationType: RelationType,
  source: Endpoint,
  target: Endpoint,
  newId: () => string = () => crypto.randomUUID(),
): OperationDraft[] {
  const sourceName = source.node?.data.name || source.id;
  const targetName = target.node?.data.name || target.id;
  const sourceNodeId = source.id;
  const targetNodeId = target.id;

  if (relationType === "N:N") {
    const junctionId = newId();
    const sx = source.node?.position.x ?? 250;
    const sy = source.node?.position.y ?? 150;
    const tx = target.node?.position.x ?? 250;
    const ty = target.node?.position.y ?? 150;

    const junctionNode = {
      id: junctionId,
      type: "entityNode",
      position: { x: (sx + tx) / 2, y: (sy + ty) / 2 },
      data: {
        name: `${sourceName}_${targetName}`,
        fields: [
          fkField(newId(), `fk_${sourceName}_id`, 0, true),
          fkField(newId(), `fk_${targetName}_id`, 1, true),
        ],
      },
    };

    const edgeData = { relationType: "1:N" as const, sourceNodeId, targetNodeId, junctionId };
    const edge1 = { id: newId(), source: sourceNodeId, target: junctionId, label: "1:N", type: "floating", data: edgeData };
    const edge2 = { id: newId(), source: junctionId, target: targetNodeId, label: "1:N", type: "floating", data: { ...edgeData } };

    return [
      { type: "ADD_NODE", targetId: junctionId, payload: junctionNode },
      { type: "ADD_EDGE", targetId: edge1.id, payload: edge1 },
      { type: "ADD_EDGE", targetId: edge2.id, payload: edge2 },
    ];
  }

  const edgeId = newId();
  const fkName = `fk_${sourceName}_id`;
  const fkFieldId = newId();

  const edge = {
    id: edgeId,
    source: sourceNodeId,
    sourceHandle: source.handle ?? undefined,
    target: targetNodeId,
    targetHandle: target.handle ?? undefined,
    label: relationType,
    type: "floating",
    data: { relationType, sourceNodeId, targetNodeId, fkFieldName: fkName, fkFieldId },
  };

  const visibleFieldCount = (target.node?.data.fields ?? []).length;

  return [
    { type: "ADD_EDGE", targetId: edgeId, payload: edge },
    {
      type: "ADD_FIELD",
      targetId: targetNodeId,
      payload: fkField(fkFieldId, fkName, visibleFieldCount, false),
    },
  ];
}
