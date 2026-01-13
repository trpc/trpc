import type { Socket } from 'net';
import { createServer } from 'node:http';
import { parse } from 'node:url';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import next from 'next';
import { WebSocketServer } from 'ws';
import { msgpackEncoder } from '../utils/encoder';
import { appRouter } from './routers/_app';

const port = parseInt(process.env.PORT ?? '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    if (!req.url) return;
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server });
  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    experimental_encoder: msgpackEncoder,
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM');
    handler.broadcastReconnectNotification();
  });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket as Socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  const originalOn = server.on.bind(server);
  server.on = function (event, listener) {
    return event !== 'upgrade' ? originalOn(event, listener) : server;
  };
  server.listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`,
  );
  console.log('📦 Using MessagePack encoding');
});
