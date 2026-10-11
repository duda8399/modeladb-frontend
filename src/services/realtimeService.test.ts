import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O socket.io-client é substituído por um socket falso para verificar o
 * contrato do serviço com o gateway sem precisar de servidor.
 */
type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  handlers = new Map<string, Handler[]>();
  emitted: [string, unknown][] = [];
  disconnected = false;

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, payload: unknown) {
    this.emitted.push([event, payload]);
  }
  fire(event: string, payload?: unknown) {
    if (event === "connect") this.connected = true;
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  disconnect() {
    this.disconnected = true;
    this.connected = false;
  }
}

const sockets: FakeSocket[] = [];
const ioMock = vi.fn((url: string, opts: unknown) => {
  void url;
  void opts;
  const s = new FakeSocket();
  sockets.push(s);
  return s;
});

vi.mock("socket.io-client", () => ({ io: ioMock }));

async function loadService() {
  vi.resetModules();
  return (await import("./realtimeService")).default;
}

const handlers = () => ({
  onOperation: vi.fn(),
  onPresence: vi.fn(),
  onCursor: vi.fn(),
  onError: vi.fn(),
});

describe("realtimeService", () => {
  beforeEach(() => {
    sockets.length = 0;
    ioMock.mockClear();
  });

  it("envia o JWT no handshake", async () => {
    const service = await loadService();

    service.connect({ diagramId: "d1", token: "jwt-123", ...handlers() });

    expect(ioMock.mock.calls[0][1]).toEqual({ auth: { token: "jwt-123" } });
  });

  it("entra na sala do diagrama a cada conexão, inclusive após reconectar", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", token: "t", ...handlers() });
    const socket = sockets[0];

    socket.fire("connect");
    socket.fire("connect");

    expect(socket.emitted).toEqual([
      ["join_diagram", { diagramId: "d1" }],
      ["join_diagram", { diagramId: "d1" }],
    ]);
  });

  it("repassa operation, presence, cursor e error para os callbacks", async () => {
    const service = await loadService();
    const h = handlers();
    service.connect({ diagramId: "d1", token: "t", ...h });
    const socket = sockets[0];

    socket.fire("operation", { opId: "x" });
    socket.fire("presence", { type: "USER_LEFT", userId: "u" });
    socket.fire("cursor", { userId: "u", x: 1, y: 2 });
    socket.fire("error", { message: "Sem permissão para editar" });

    expect(h.onOperation).toHaveBeenCalledWith({ opId: "x" });
    expect(h.onPresence).toHaveBeenCalledWith({ type: "USER_LEFT", userId: "u" });
    expect(h.onCursor).toHaveBeenCalledWith({ userId: "u", x: 1, y: 2 });
    expect(h.onError).toHaveBeenCalledWith({ message: "Sem permissão para editar" });
  });

  it("repassa document_restored para o callback de restauração", async () => {
    const service = await loadService();
    const onDocumentRestored = vi.fn();
    service.connect({ diagramId: "d1", token: "t", ...handlers(), onDocumentRestored });

    const event = { diagramId: "d1", versionId: "v1", userId: "u", userName: "Ana" };
    sockets[0].fire("document_restored", event);

    expect(onDocumentRestored).toHaveBeenCalledWith(event);
  });

  it("não abre uma segunda conexão se já estiver conectado", async () => {
    const service = await loadService();

    service.connect({ diagramId: "d1", token: "t", ...handlers() });
    service.connect({ diagramId: "d2", token: "t", ...handlers() });

    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it("não envia operações nem cursores antes de conectar", async () => {
    const service = await loadService();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    service.connect({ diagramId: "d1", token: "t", ...handlers() });

    service.sendOperation({ opId: "1", type: "MOVE_NODE", targetId: "n", userId: "u", lamport: 1 });
    service.sendCursor({ x: 1, y: 1 });

    expect(sockets[0].emitted).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("envia operações e cursores depois de conectar", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", token: "t", ...handlers() });
    sockets[0].fire("connect");

    const op = { opId: "1", type: "MOVE_NODE" as const, targetId: "n", userId: "u", lamport: 1 };
    service.sendOperation(op);
    service.sendCursor({ x: 3, y: 4 });

    expect(sockets[0].emitted.slice(1)).toEqual([
      ["operation", op],
      ["cursor", { x: 3, y: 4 }],
    ]);
  });

  it("disconnect encerra o socket e permite conectar de novo", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", token: "t", ...handlers() });

    service.disconnect();
    service.connect({ diagramId: "d2", token: "t", ...handlers() });

    expect(sockets[0].disconnected).toBe(true);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});
