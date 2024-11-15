import http from 'http';
import type { Socket } from 'net';
import { incomingMessageToRequest } from '../../../adapters/node-http/incomingMessageToRequest';
import { writeResponse } from '../../../adapters/node-http/writeResponse';
import { run } from '../../utils';

type Handler = (request: Request) => Response | Promise<Response>;

export function serverResource(handler: Handler) {
  const connections = new Map<typeof requestId, Socket>();

  const onRequestEnd = vi.fn(() => {
    // noop
  });
  const server = http.createServer((req, res) => {
    run(async () => {
      const request = incomingMessageToRequest(req, res, {
        maxBodySize: null,
      });

      request.signal.addEventListener('abort', () => {
        onRequestEnd();
      });

      const response = await handler(request);
      await writeResponse({
        request,
        response,
        rawResponse: res,
      });
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`Uncaught error in request handler`, err);
      throw err;
    });
  });
  server.listen(0);

  let requestId = 0;
  server.on('connection', (conn) => {
    const idx = ++requestId;
    connections.set(idx, conn);
  });

  const port = (server.address() as any).port;

  const url = `http://localhost:${port}`;

  async function close() {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    url,
    onRequestEnd,
    restart: async () => {
      for (const conn of connections.values()) {
        conn.destroy();
      }
      await close();

      server.listen(port);
    },
    [Symbol.asyncDispose]: async () => {
      for (const conn of connections.values()) {
        conn.destroy();
      }
      await close();
    },
  };
}
