import http from 'http';
import type { Socket } from 'net';

export function createServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
) {
  const server = http.createServer(async (req, res) => {
    handler(req, res);
  });
  server.listen(0);

  const connections = new Set<Socket>();
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.once('close', () => {
      connections.delete(conn);
    });
  });

  const port = (server.address() as any).port;

  const url = `http://localhost:${port}`;

  async function forceClose() {
    for (const conn of connections) {
      conn.destroy();
    }
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }

  return {
    url,
    close: async () => {
      await forceClose();
    },
    restart: async () => {
      await forceClose();

      server.listen(port);
    },
  };
}
