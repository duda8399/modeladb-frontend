import { Position, internalsSymbol } from "reactflow";

type Side = Position.Left | Position.Right;

// Centro do ponto de conexao (handle) do lado pedido, em coordenadas do fluxo.
// Usa a posicao medida pelo ReactFlow (handleBounds) para a linha nascer
// exatamente na bolinha; se o no ainda nao foi medido, cai no meio da lateral.
function getHandlePoint(node: any, side: Side) {
  const { positionAbsolute: pos, width = 0, height = 0 } = node;
  const handle = node[internalsSymbol]?.handleBounds?.source?.find(
    (h: any) => h.position === side,
  );

  if (handle) {
    return {
      x: pos.x + handle.x + handle.width / 2,
      y: pos.y + handle.y + handle.height / 2,
    };
  }

  return {
    x: side === Position.Left ? pos.x : pos.x + width,
    y: pos.y + height / 2,
  };
}

// Escolhe de qual lateral (esquerda/direita) sai e chega a aresta:
// - tabelas lado a lado: as laterais que estao de frente uma para a outra;
// - tabelas empilhadas (sobrepostas no eixo x): ambas pela direita, formando
//   um "C" por fora em vez de atravessar as tabelas.
function getSides(source: any, target: any): [Side, Side] {
  const sLeft = source.positionAbsolute.x;
  const sRight = sLeft + (source.width ?? 0);
  const tLeft = target.positionAbsolute.x;
  const tRight = tLeft + (target.width ?? 0);

  if (sRight <= tLeft) return [Position.Right, Position.Left];
  if (tRight <= sLeft) return [Position.Left, Position.Right];
  return [Position.Right, Position.Right];
}

// Quem e source/target continua definido pela ordem do clique; aqui so
// decidimos em qual bolinha de cada tabela a linha encosta.
export function getEdgeParams(source: any, target: any) {
  const [sourcePos, targetPos] = getSides(source, target);
  const s = getHandlePoint(source, sourcePos);
  const t = getHandlePoint(target, targetPos);

  return { sx: s.x, sy: s.y, tx: t.x, ty: t.y, sourcePos, targetPos };
}
