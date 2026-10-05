import { bench, describe } from "vitest";
import { useDiagramCollabStore, type Operation } from "./diagramCollabStore";
import { entity, field } from "../test/replica";
import { generateSqlScript } from "../utils/sqlExport";
import type { CustomNode } from "../types/diagramER";

/**
 * Item 6 — Custo de processamento no navegador.
 * Mede quantas operações remotas por segundo o store consegue aplicar,
 * conforme o tamanho do diagrama.
 *
 *   npm run bench
 */

const SIZES = [10, 100, 500, 1000];
let seq = 0;

function diagram(nodeCount: number, fieldsPerNode = 10) {
  return Array.from({ length: nodeCount }, (_, i) => {
    const node = entity(`n${i}`, `tabela_${i}`, i * 10, i * 10);
    node.data.fields = Array.from({ length: fieldsPerNode }, (_, j) => field(`n${i}-f${j}`, `coluna_${j}`, j));
    return node;
  });
}

function remote(op: Omit<Operation, "opId" | "userId" | "lamport">): Operation {
  seq++;
  return { ...op, opId: `bench-${seq}`, userId: "remoto", lamport: seq };
}

for (const size of SIZES) {
  describe(`diagrama com ${size} entidades (10 colunas cada)`, () => {
    const setup = () => {
      useDiagramCollabStore.getState().loadDocument(diagram(size), []);
    };

    bench(
      "aplicar MOVE_NODE remoto",
      () => {
        const target = `n${seq % size}`;
        useDiagramCollabStore.getState().applyOperation(
          remote({ type: "MOVE_NODE", targetId: target, payload: { x: seq, y: seq } }),
          false,
        );
      },
      { setup },
    );

    bench(
      "aplicar SET_FIELD_PROP remoto",
      () => {
        const n = seq % size;
        useDiagramCollabStore.getState().applyOperation(
          remote({
            type: "SET_FIELD_PROP",
            targetId: `n${n}`,
            payload: { fieldId: `n${n}-f${seq % 10}`, key: "name", value: `c${seq}` },
          }),
          false,
        );
      },
      { setup },
    );

    bench("compactDocument (preparar para salvar)", () => {
      useDiagramCollabStore.getState().compactDocument();
    }, { setup });

    bench("generateSqlScript (exportar SQL)", () => {
      generateSqlScript(useDiagramCollabStore.getState().nodes as unknown as CustomNode[], [], "postgres");
    }, { setup });
  });
}
