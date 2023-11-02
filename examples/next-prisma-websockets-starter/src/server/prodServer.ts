import next from 'next';
import { createServer } from 'node:http';
import { parse } from 'node:url';

import { WebSocketServer } from 'ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';

import { createContext } from './context';
import { appRouter } from './routers/_app';

const port = parseInt(process.env.PORT || '3000', 10);
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
  const handler = applyWSSHandler({ wss, router: appRouter, createContext });

  process.on('SIGTERM', () => {
    console.log('SIGTERM');
    handler.broadcastReconnectNotification();
  });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  server.listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`,
  );
});
