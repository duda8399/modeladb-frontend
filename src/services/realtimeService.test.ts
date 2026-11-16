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
  acks: ((meta: unknown) => void)[] = [];
  emit(event: string, payload: unknown, ack?: (meta: unknown) => void) {
    this.emitted.push([event, payload]);
    if (ack) this.acks.push(ack);
  }
  connect() {
    this.reconnects += 1;
  }
  reconnects = 0;
  fire(event: string, ...payload: unknown[]) {
    if (event === "connect") this.connected = true;
    if (event === "disconnect") this.connected = false;
    this.handlers.get(event)?.forEach((h) => h(...payload));
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

  it("envia o JWT no handshake, pedindo um token válido a cada conexão", async () => {
    const service = await loadService();
    const getToken = vi.fn().mockResolvedValueOnce("jwt-123").mockResolvedValueOnce("jwt-456");

    service.connect({ diagramId: "d1", getToken, ...handlers() });

    const { auth } = ioMock.mock.calls[0][1] as {
      auth: (cb: (data: object) => void) => void;
    };
    const first = await new Promise((resolve) => auth(resolve));
    const second = await new Promise((resolve) => auth(resolve));

    expect(first).toEqual({ token: "jwt-123" });
    expect(second).toEqual({ token: "jwt-456" });
  });

  it("repassa role_changed e access_revoked", async () => {
    const service = await loadService();
    const onRoleChanged = vi.fn();
    const onAccessRevoked = vi.fn();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers(), onRoleChanged, onAccessRevoked });

    sockets[0].fire("role_changed", { diagramId: "d1", role: "VIEWER" });
    sockets[0].fire("access_revoked", { diagramId: "d1", reason: "removed" });

    expect(onRoleChanged).toHaveBeenCalledWith({ diagramId: "d1", role: "VIEWER" });
    expect(onAccessRevoked).toHaveBeenCalledWith({ diagramId: "d1", reason: "removed" });
  });

  it("entra na sala na primeira conexão sem cursor e, ao reconectar, informa a última posição vista", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });
    const socket = sockets[0];

    socket.fire("connect");
    socket.fire("sync", { epoch: "e1", seq: 4, ops: [], complete: true, initial: true });
    socket.fire("operation", { opId: "x" }, { epoch: "e1", seq: 5 });
    socket.fire("disconnect", "transport close");
    socket.fire("connect");

    expect(socket.emitted).toEqual([
      ["join_diagram", { diagramId: "d1" }],
      ["join_diagram", { diagramId: "d1", since: { epoch: "e1", seq: 5 } }],
    ]);
  });

  it("repassa operation, presence, cursor e error para os callbacks", async () => {
    const service = await loadService();
    const h = handlers();
    service.connect({ diagramId: "d1", getToken: () => "t", ...h });
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
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers(), onDocumentRestored });

    const event = { diagramId: "d1", versionId: "v1", userId: "u", userName: "Ana" };
    sockets[0].fire("document_restored", event);

    expect(onDocumentRestored).toHaveBeenCalledWith(event);
  });

  it("não abre uma segunda conexão se já estiver conectado", async () => {
    const service = await loadService();

    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });
    service.connect({ diagramId: "d2", getToken: () => "t", ...handlers() });

    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  const op = (n: number) => ({ opId: String(n), type: "MOVE_NODE" as const, targetId: "n", userId: "u", lamport: n });
  const joined = (socket: FakeSocket, seq = 0) => {
    socket.fire("connect");
    socket.fire("sync", { epoch: "e1", seq, ops: [], complete: true, initial: true });
  };

  it("guarda operações feitas antes de entrar na sala e envia depois da sincronização", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });
    const socket = sockets[0];

    service.sendOperation(op(1));
    service.sendCursor({ x: 1, y: 1 });
    expect(socket.emitted).toEqual([]);
    expect(service.getPendingOperations()).toHaveLength(1);

    joined(socket);

    expect(socket.emitted).toEqual([
      ["join_diagram", { diagramId: "d1" }],
      ["operation", op(1)],
    ]);
    expect(service.getPendingOperations()).toEqual([]);
  });

  it("envia operações e cursores depois de entrar na sala", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });
    joined(sockets[0]);

    service.sendOperation(op(1));
    service.sendCursor({ x: 3, y: 4 });

    expect(sockets[0].emitted.slice(1)).toEqual([
      ["operation", op(1)],
      ["cursor", { x: 3, y: 4 }],
    ]);
  });

  it("enfileira as edições feitas com a conexão caída e as reenvia ao reconectar", async () => {
    const service = await loadService();
    const onStatusChange = vi.fn();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers(), onStatusChange });
    const socket = sockets[0];
    joined(socket);

    socket.fire("disconnect", "transport close");
    service.sendOperation(op(1));
    service.sendOperation(op(2));

    expect(onStatusChange).toHaveBeenLastCalledWith("reconnecting", 2);

    socket.fire("connect");
    socket.fire("sync", { epoch: "e1", seq: 0, ops: [], complete: true, initial: false });

    expect(socket.emitted.filter(([e]) => e === "operation").map(([, p]) => p)).toEqual([op(1), op(2)]);
    expect(onStatusChange).toHaveBeenLastCalledWith("connected", 0);
  });

  it("aplica as operações perdidas que chegam na sincronização", async () => {
    const service = await loadService();
    const h = handlers();
    service.connect({ diagramId: "d1", getToken: () => "t", ...h });
    const socket = sockets[0];
    joined(socket, 2);
    socket.fire("disconnect", "transport close");
    socket.fire("connect");

    socket.fire("sync", { epoch: "e1", seq: 4, ops: [op(3), op(4)], complete: true, initial: false });

    expect(h.onOperation.mock.calls.map(([o]) => o.opId)).toEqual(["3", "4"]);
  });

  it("pede recarga quando a sincronização é incompleta e segura as operações até terminar", async () => {
    const service = await loadService();
    const h = handlers();
    let finishReload: () => void = () => {};
    const onResyncNeeded = vi.fn(() => new Promise<void>((resolve) => (finishReload = resolve)));
    service.connect({ diagramId: "d1", getToken: () => "t", ...h, onResyncNeeded });
    const socket = sockets[0];
    joined(socket, 2);
    socket.fire("disconnect", "transport close");
    service.sendOperation(op(10));
    socket.fire("connect");

    socket.fire("sync", { epoch: "e2", seq: 7, ops: [], complete: false, initial: false });
    socket.fire("operation", op(8), { epoch: "e2", seq: 8 });

    expect(onResyncNeeded).toHaveBeenCalledTimes(1);
    expect(h.onOperation).not.toHaveBeenCalled();
    expect(socket.emitted.filter(([e]) => e === "operation")).toEqual([]);

    finishReload();
    await new Promise((r) => setTimeout(r, 0));

    expect(h.onOperation.mock.calls.map(([o]) => o.opId)).toEqual(["8"]);
    expect(socket.emitted.filter(([e]) => e === "operation").map(([, p]) => p)).toEqual([op(10)]);
  });

  it("depois da recarga aplica as operações da época nova antes das que chegaram durante ela", async () => {
    const service = await loadService();
    const h = handlers();
    let finishReload: () => void = () => {};
    const onResyncNeeded = vi.fn(() => new Promise<void>((resolve) => (finishReload = resolve)));
    service.connect({ diagramId: "d1", getToken: () => "t", ...h, onResyncNeeded });
    const socket = sockets[0];
    joined(socket, 2);
    socket.fire("disconnect", "transport close");
    socket.fire("connect");

    socket.fire("sync", { epoch: "e2", seq: 2, ops: [op(1), op(2)], complete: false, initial: false });
    socket.fire("operation", op(3), { epoch: "e2", seq: 3 });
    expect(h.onOperation).not.toHaveBeenCalled();

    finishReload();
    await new Promise((r) => setTimeout(r, 0));

    expect(h.onOperation.mock.calls.map(([o]) => o.opId)).toEqual(["1", "2", "3"]);
  });

  it("usa a confirmação do servidor para avançar a posição", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });
    const socket = sockets[0];
    joined(socket, 1);

    service.sendOperation(op(1));
    socket.acks[0]({ epoch: "e1", seq: 2 });
    socket.fire("disconnect", "transport close");
    socket.fire("connect");

    expect(socket.emitted.at(-1)).toEqual(["join_diagram", { diagramId: "d1", since: { epoch: "e1", seq: 2 } }]);
  });

  it("tenta reconectar quando o servidor derruba a conexão", async () => {
    vi.useFakeTimers();
    const service = await loadService();
    const onStatusChange = vi.fn();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers(), onStatusChange });
    const socket = sockets[0];
    joined(socket);

    socket.fire("disconnect", "io server disconnect");
    expect(onStatusChange).toHaveBeenLastCalledWith("reconnecting", 0);

    vi.advanceTimersByTime(1000);
    expect(socket.reconnects).toBe(1);
    vi.useRealTimers();
  });

  it("disconnect encerra o socket e permite conectar de novo", async () => {
    const service = await loadService();
    service.connect({ diagramId: "d1", getToken: () => "t", ...handlers() });

    service.disconnect();
    service.connect({ diagramId: "d2", getToken: () => "t", ...handlers() });

    expect(sockets[0].disconnected).toBe(true);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});
