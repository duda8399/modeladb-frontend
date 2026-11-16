import net from "node:net";

export type NetworkLink = {
  port: number;
  cut: () => void;
  restore: () => void;
  close: () => Promise<void>;
};

export function createLink(targetPort: number): Promise<NetworkLink> {
  const sockets = new Set<net.Socket>();
  let down = false;

  const server = net.createServer((client) => {
    if (down) {
      client.destroy();
      return;
    }

    const upstream = net.connect(targetPort, "127.0.0.1");
    sockets.add(client);
    sockets.add(upstream);

    const teardown = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };

    client.on("error", teardown);
    upstream.on("error", teardown);
    client.on("close", teardown);
    upstream.on("close", teardown);
    client.pipe(upstream);
    upstream.pipe(client);
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolvePromise({
        port,
        cut: () => {
          down = true;
          for (const socket of sockets) socket.destroy();
          sockets.clear();
        },
        restore: () => {
          down = false;
        },
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) socket.destroy();
            sockets.clear();
            server.close(() => done());
          }),
      });
    });
  });
}
