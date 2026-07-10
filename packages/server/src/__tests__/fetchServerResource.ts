import http from 'http';
import type { Socket } from 'net';
import { incomingMessageToRequest } from '../adapters/node-http/incomingMessageToRequest';
import { writeResponse } from '../adapters/node-http/writeResponse';
import { makeAsyncResource } from '../unstable-core-do-not-import/stream/utils/disposable';
import { run } from '../unstable-core-do-not-import/utils';

type Handler = (request: Request) => Response | Promise<Response>;

export function fetchServerResource(handler: Handler) {
  const connections = new Map<typeof requestId, Socket>();

  let abortCount = 0;
  const server = http.createServer((req, res) => {
    run(async () => {
      const request = incomingMessageToRequest(req, res, {
        maxBodySize: null,
      });

      request.signal.addEventListener('abort', () => {
        abortCount++;
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

    conn.once('close', () => {
      connections.delete(idx);
    });
  });

  const port = (server.address() as any).port;

  const url = `http://localhost:${port}`;

  async function forceClose() {
    for (const conn of connections.values()) {
      conn.destroy();
    }
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

  return makeAsyncResource(
    {
      url,
      get abortCount() {
        return abortCount;
      },
      restart: async () => {
        await forceClose();

        server.listen(port);
      },
    },
    async () => {
      await forceClose();
    },
  );
}
