import { beforeEach, describe, expect, it } from "vitest";
import { createReplica, edge, entity, field, type Replica } from "../test/replica";
import type { Operation } from "./diagramCollabStore";

/**
 * Item 1 — Testes unitários do store colaborativo (CRDT-lite).
 * Cada propriedade do algoritmo é verificada isoladamente.
 */

function remoteOp(partial: Partial<Operation> & Pick<Operation, "type" | "targetId">): Operation {
  return {
    opId: crypto.randomUUID(),
    userId: "remoto",
    lamport: 1,
    ...partial,
  };
}

describe("diagramCollabStore", () => {
  let r: Replica;

  beforeEach(async () => {
    r = await createReplica("alice");
    r.load([entity("cliente", "Cliente")]);
  });

  describe("relógio de Lamport", () => {
    it("cada operação local recebe um lamport maior que o anterior e um opId único", () => {
      const a = r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 1, y: 1 } });
      const b = r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 2, y: 2 } });

      expect(b.lamport).toBe(a.lamport + 1);
      expect(a.opId).not.toBe(b.opId);
      expect(a.userId).toBe("alice");
    });

    it("ao carregar um documento, o relógio continua do maior lamport salvo", () => {
      const saved = entity("pedido");
      saved.data._crdt = { name: { lamport: 41, userId: "bob" } };

      r.load([saved]);
      const op = r.local({ type: "SET_NODE_PROP", targetId: "pedido", payload: { key: "name", value: "X" } });

      expect(op.lamport).toBe(42);
      expect(r.state().getNode("pedido")?.data.name).toBe("X");
    });

    it("ao receber uma operação remota, o relógio local avança além dela", () => {
      r.receive(
        remoteOp({
          type: "SET_NODE_PROP",
          targetId: "cliente",
          lamport: 10,
          payload: { key: "name", value: "Nome remoto" },
        }),
      );

      const op = r.local({ type: "SET_NODE_PROP", targetId: "cliente", payload: { key: "name", value: "Nome local" } });

      expect(op.lamport).toBeGreaterThan(10);
      // A edição feita DEPOIS de ver a remota precisa vencer.
      expect(r.state().getNode("cliente")?.data.name).toBe("Nome local");
    });
  });

  describe("last-writer-wins (LWW)", () => {
    const rename = (lamport: number, userId: string, value: string) =>
      remoteOp({ type: "SET_NODE_PROP", targetId: "cliente", lamport, userId, payload: { key: "name", value } });

    it("o maior lamport vence, independentemente da ordem de chegada", async () => {
      const older = rename(3, "bob", "Antigo");
      const newer = rename(5, "carol", "Novo");

      r.receive(older);
      r.receive(newer);

      const other = await createReplica("dave");
      other.load([entity("cliente", "Cliente")]);
      other.receive(newer);
      other.receive(older);

      expect(r.state().getNode("cliente")?.data.name).toBe("Novo");
      expect(other.state().getNode("cliente")?.data.name).toBe("Novo");
    });

    it("em empate de lamport, vence o maior userId (desempate determinístico)", () => {
      r.receive(rename(7, "bob", "do Bob"));
      r.receive(rename(7, "ana", "da Ana"));

      expect(r.state().getNode("cliente")?.data.name).toBe("do Bob");
    });

    it("registra o vencedor nos metadados _crdt", () => {
      r.receive(rename(9, "bob", "X"));

      expect(r.state().getNode("cliente")?.data._crdt?.name).toEqual({ lamport: 9, userId: "bob" });
    });

    it("cada eixo da posição é um registro independente", () => {
      r.receive(remoteOp({ type: "MOVE_NODE", targetId: "cliente", lamport: 5, userId: "bob", payload: { x: 50, y: 50 } }));
      r.receive(remoteOp({ type: "MOVE_NODE", targetId: "cliente", lamport: 4, userId: "zed", payload: { x: 99, y: 99 } }));

      expect(r.state().getNode("cliente")?.position).toEqual({ x: 50, y: 50 });
    });

    it("propriedades de campos também seguem LWW", () => {
      r.local({ type: "ADD_FIELD", targetId: "cliente", payload: field("f1", "id") });

      r.receive(remoteOp({ type: "SET_FIELD_PROP", targetId: "cliente", lamport: 20, userId: "bob", payload: { fieldId: "f1", key: "type", value: "VARCHAR" } }));
      r.receive(remoteOp({ type: "SET_FIELD_PROP", targetId: "cliente", lamport: 19, userId: "zed", payload: { fieldId: "f1", key: "type", value: "TEXT" } }));

      expect(r.state().getField("cliente", "f1")?.type).toBe("VARCHAR");
    });
  });

  describe("idempotência", () => {
    it("aplicar a mesma operação duas vezes tem o mesmo efeito que aplicar uma", () => {
      const op = remoteOp({ type: "ADD_FIELD", targetId: "cliente", payload: field("f1") });

      r.receive(op);
      r.receive(op);

      expect(r.state().getNode("cliente")?.data.fields).toHaveLength(1);
    });

    it("operações duplicadas não entram duas vezes no histórico", () => {
      const op = r.state().stampOperation({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 1, y: 1 } }, "alice");

      r.state().applyOperation(op);
      r.state().applyOperation(op);

      expect(r.state().undoStack).toHaveLength(1);
    });

    it("ignora operações sem tipo ou sem opId", () => {
      r.state().applyOperation({ type: "DELETE_NODE", targetId: "cliente" } as Operation);

      expect(r.state().getNode("cliente")?.data.deleted).toBeUndefined();
    });
  });

  describe("operações fora de ordem (fila de pendentes)", () => {
    it("um MOVE que chega antes do ADD_NODE é aplicado quando o nó chega", () => {
      r.receive(remoteOp({ type: "MOVE_NODE", targetId: "pedido", lamport: 2, payload: { x: 300, y: 400 } }));
      expect(r.state().getNode("pedido")).toBeUndefined();
      expect(r.state().pendingOperations.get("pedido")).toHaveLength(1);

      r.receive(remoteOp({ type: "ADD_NODE", targetId: "pedido", lamport: 1, payload: entity("pedido") }));

      expect(r.state().getNode("pedido")?.position).toEqual({ x: 300, y: 400 });
      expect(r.state().pendingOperations.has("pedido")).toBe(false);
    });

    it("uma edição de campo que chega antes do ADD_FIELD espera o campo existir", () => {
      r.receive(remoteOp({ type: "SET_FIELD_PROP", targetId: "cliente", lamport: 3, payload: { fieldId: "f9", key: "name", value: "email" } }));
      r.receive(remoteOp({ type: "ADD_FIELD", targetId: "cliente", lamport: 2, payload: field("f9", "sem_nome") }));

      expect(r.state().getField("cliente", "f9")?.name).toBe("email");
    });

    it("um DELETE_NODE que chega antes do ADD_NODE resulta no nó apagado", () => {
      r.receive(remoteOp({ type: "DELETE_NODE", targetId: "pedido", lamport: 2 }));
      r.receive(remoteOp({ type: "ADD_NODE", targetId: "pedido", lamport: 1, payload: entity("pedido") }));

      expect(r.state().getNode("pedido")?.data.deleted).toBe(true);
    });

    it("um DELETE_EDGE que chega antes do ADD_EDGE resulta na aresta apagada", () => {
      r.load([entity("a"), entity("b")]);

      r.receive(remoteOp({ type: "DELETE_EDGE", targetId: "e1", lamport: 2 }));
      r.receive(remoteOp({ type: "ADD_EDGE", targetId: "e1", lamport: 1, payload: edge("e1", "a", "b") }));

      expect(r.state().getEdge("e1")?.data?.deleted).toBe(true);
    });
  });

  describe("exclusão lógica (soft delete)", () => {
    it("DELETE_NODE marca o nó como apagado sem removê-lo do array", () => {
      r.local({ type: "DELETE_NODE", targetId: "cliente" });

      expect(r.state().nodes).toHaveLength(1);
      expect(r.state().getNode("cliente")?.data.deleted).toBe(true);
    });

    it("compactDocument remove nós/campos apagados e arestas órfãs", () => {
      r.load([entity("a"), entity("b"), entity("c")], [edge("ab", "a", "b"), edge("bc", "b", "c")]);
      r.local({ type: "ADD_FIELD", targetId: "a", payload: field("keep") });
      r.local({ type: "ADD_FIELD", targetId: "a", payload: field("drop") });
      r.local({ type: "REMOVE_FIELD", targetId: "a", payload: { fieldId: "drop" } });
      r.local({ type: "DELETE_NODE", targetId: "c" });

      const doc = r.state().compactDocument();

      expect(doc.nodes.map((n) => n.id)).toEqual(["a", "b"]);
      expect(doc.nodes[0].data.fields.map((f: { id: string }) => f.id)).toEqual(["keep"]);
      expect(doc.edges.map((e) => e.id)).toEqual(["ab"]);
    });

    it("compactDocument remove do documento salvo apenas o necessário (formato do Prisma)", () => {
      r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 7, y: 8 } });

      const [node] = r.state().compactDocument().nodes;

      expect(Object.keys(node).sort()).toEqual(["data", "id", "position", "style", "type"]);
      expect(node.position).toEqual({ x: 7, y: 8 });
      // Metadados de CRDT ficam dentro de `data`, o único campo livre (Json) no Prisma.
      expect(node.data._crdt.positionX.lamport).toBeGreaterThan(0);
    });
  });

  describe("desfazer e refazer", () => {
    it("desfazer ADD_NODE apaga o nó e refazer o restaura", () => {
      r.local({ type: "ADD_NODE", targetId: "pedido", payload: entity("pedido") });

      r.undo();
      expect(r.state().getNode("pedido")?.data.deleted).toBe(true);

      r.redo();
      expect(r.state().getNode("pedido")?.data.deleted).toBe(false);
    });

    it("desfazer MOVE_NODE volta para a posição anterior", () => {
      r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 100, y: 100 }, previousPosition: { x: 0, y: 0 } });

      r.undo();
      expect(r.state().getNode("cliente")?.position).toEqual({ x: 0, y: 0 });

      r.redo();
      expect(r.state().getNode("cliente")?.position).toEqual({ x: 100, y: 100 });
    });

    it("desfazer SET_FIELD_PROP restaura o valor anterior", () => {
      r.local({ type: "ADD_FIELD", targetId: "cliente", payload: field("f1", "nome") });
      r.local({ type: "SET_FIELD_PROP", targetId: "cliente", payload: { fieldId: "f1", key: "name", value: "email" }, previousValue: "nome" });

      r.undo();
      expect(r.state().getField("cliente", "f1")?.name).toBe("nome");
    });

    it("desfazer DELETE_EDGE restaura a aresta", () => {
      r.load([entity("a"), entity("b")], [edge("ab", "a", "b")]);
      r.local({ type: "DELETE_EDGE", targetId: "ab" });

      r.undo();
      expect(r.state().getEdge("ab")?.data?.deleted).toBe(false);
    });

    it("desfazer REMOVE_FIELD e SET_FIELD_ORDER", () => {
      r.local({ type: "ADD_FIELD", targetId: "cliente", payload: field("f1", "id", 0) });
      r.local({ type: "SET_FIELD_ORDER", targetId: "cliente", payload: { fieldId: "f1", order: 5 }, previousValue: 0 });
      r.local({ type: "REMOVE_FIELD", targetId: "cliente", payload: { fieldId: "f1" } });

      r.undo();
      expect(r.state().getField("cliente", "f1")?.deleted).toBe(false);
      r.undo();
      expect(r.state().getField("cliente", "f1")?.order).toBe(0);
    });

    it("uma nova edição limpa a pilha de refazer", () => {
      r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 1, y: 1 }, previousPosition: { x: 0, y: 0 } });
      r.undo();
      expect(r.state().redoStack).toHaveLength(1);

      r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 2, y: 2 }, previousPosition: { x: 0, y: 0 } });
      expect(r.state().redoStack).toHaveLength(0);
      expect(r.redo()).toBeNull();
    });

    it("operações remotas não entram no histórico local", () => {
      r.receive(remoteOp({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 9, y: 9 } }));

      expect(r.state().undoStack).toHaveLength(0);
      expect(r.undo()).toBeNull();
    });

    it("o histórico guarda no máximo 100 operações", () => {
      for (let i = 0; i < 120; i++) {
        r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: i, y: i }, previousPosition: { x: 0, y: 0 } });
      }

      expect(r.state().undoStack).toHaveLength(100);
    });

    it("desfazer gera uma operação inversa que, enviada a outra réplica, produz o mesmo estado", async () => {
      const bob = await createReplica("bob");
      bob.load([entity("cliente", "Cliente")]);

      const op = r.local({ type: "SET_NODE_PROP", targetId: "cliente", payload: { key: "name", value: "Pessoa" }, previousValue: "Cliente" });
      bob.receive(op);

      const inverse = r.undo()!;
      bob.receive(inverse);

      expect(inverse.type).toBe("SET_NODE_PROP");
      expect(r.state().getNode("cliente")?.data.name).toBe("Cliente");
      expect(bob.snapshot()).toEqual(r.snapshot());
    });

    it("desfazer depois de receber edições remotas ainda tem efeito", () => {
      r.local({ type: "ADD_FIELD", targetId: "cliente", payload: field("f1", "a") });
      r.receive(remoteOp({ type: "SET_NODE_PROP", targetId: "cliente", lamport: 50, userId: "bob", payload: { key: "name", value: "B" } }));

      r.undo();

      expect(r.state().getField("cliente", "f1")?.deleted).toBe(true);
    });
  });

  describe("estado inicial", () => {
    it("resetDocument zera documento, histórico e relógio", () => {
      r.local({ type: "MOVE_NODE", targetId: "cliente", payload: { x: 1, y: 1 } });

      r.state().resetDocument();

      expect(r.state().nodes).toEqual([]);
      expect(r.state().undoStack).toEqual([]);
      expect(r.state().lamport).toBe(0);
    });
  });
});
