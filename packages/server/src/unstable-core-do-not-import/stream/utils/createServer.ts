import http from 'http';
import type { Socket } from 'net';

export function serverResource(
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

  async function close() {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }

  return {
    url,
    restart: async () => {
      for (const conn of connections) {
        conn.destroy();
      }
      await close();

      server.listen(port);
    },
    [Symbol.asyncDispose]: async () => {
      await close();
    },
  };
}
