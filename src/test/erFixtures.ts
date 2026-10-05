import type { CustomEdge, CustomNode, Field } from "../types/diagramER";

/**
 * Monta diagramas no MESMO formato que o Constructor produz ao criar
 * entidades e relacionamentos (ver handleRelationConfirm no Constructor).
 */

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function col(name: string | null, type: string | null, flags: Partial<Field> = {}): Field {
  return {
    id: nextId("f"),
    name,
    type,
    pk: false,
    fk: false,
    notNull: false,
    unique: false,
    ai: false,
    ...flags,
  };
}

export function table(name: string, fields: Field[], id = nextId("n")): CustomNode {
  return {
    id,
    type: "entityNode",
    position: { x: 0, y: 0 },
    data: { name, fields },
  } as CustomNode;
}

export function pk(name = "id", type = "INT") {
  return col(name, type, { pk: true, notNull: true, unique: true, ai: true });
}

/** Relacionamento 1:1 / 1:N: cria a coluna FK na tabela de destino. */
export function oneToMany(source: CustomNode, target: CustomNode, relationType: "1:1" | "1:N" = "1:N") {
  const sourceName = (source.data as { name: string }).name;
  const fkFieldName = `fk_${sourceName}_id`;

  (target.data as { fields: Field[] }).fields.push(col(fkFieldName, "INT", { fk: true }));

  const edge: CustomEdge = {
    id: nextId("e"),
    source: source.id,
    target: target.id,
    type: "floating",
    label: relationType,
    data: { relationType, sourceNodeId: source.id, targetNodeId: target.id, fkFieldName },
  };

  return edge;
}

/** Relacionamento N:N: cria a tabela associativa e as duas arestas 1:N. */
export function manyToMany(source: CustomNode, target: CustomNode) {
  const sourceName = (source.data as { name: string }).name;
  const targetName = (target.data as { name: string }).name;

  const junction = table(`${sourceName}_${targetName}`, [
    col(`fk_${sourceName}_id`, "INT", { pk: true, fk: true, notNull: true }),
    col(`fk_${targetName}_id`, "INT", { pk: true, fk: true, notNull: true }),
  ]);

  const data = {
    relationType: "1:N" as const,
    sourceNodeId: source.id,
    targetNodeId: target.id,
    junctionId: junction.id,
  };

  const edges: CustomEdge[] = [
    { id: nextId("e"), source: source.id, target: junction.id, type: "floating", data },
    { id: nextId("e"), source: junction.id, target: target.id, type: "floating", data },
  ];

  return { junction, edges };
}

/** Diagrama de exemplo: loja virtual com 1:N e N:N. */
export function lojaDiagram() {
  const cliente = table("cliente", [
    pk(),
    col("nome", "VARCHAR", { notNull: true }),
    col("email", "VARCHAR", { unique: true }),
  ]);
  const pedido = table("pedido", [pk(), col("criado_em", "DATETIME", { notNull: true })]);
  const produto = table("produto", [pk(), col("preco", "DECIMAL"), col("ativo", "BOOLEAN")]);

  const clientePedido = oneToMany(cliente, pedido);
  const { junction, edges } = manyToMany(pedido, produto);

  const nota = { id: "nota", type: "noteNode", position: { x: 0, y: 0 }, data: { text: "lembrete" } } as CustomNode;

  return {
    nodes: [cliente, pedido, produto, junction, nota],
    edges: [clientePedido, ...edges],
    ids: { cliente: cliente.id, pedido: pedido.id, produto: produto.id, junction: junction.id },
  };
}
