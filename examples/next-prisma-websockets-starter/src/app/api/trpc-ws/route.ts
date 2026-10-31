/**
 * WebSocket endpoint for deployments on Vercel, where `prodServer.ts` can't run.
 * Locally, `wssDevServer.ts` is used instead since `next dev` can't upgrade connections.
 * @see https://vercel.com/docs/functions/websockets
 */
import { getWSConnectionHandler } from '@trpc/server/adapters/ws';
import { upgradeWebSocket } from '@vercel/functions';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';

const handleConnection = getWSConnectionHandler({
  // Only used by `applyWSSHandler()`, not when handling a single connection
  wss: new WebSocketServer({ noServer: true }),
  router: appRouter,
  createContext,
  keepAlive: { enabled: true },
});

export function GET(req: Request) {
  return upgradeWebSocket((ws) => {
    // tRPC and next-auth read the url and headers from a Node.js request
    const url = new URL(req.url);
    const incomingMessage = new IncomingMessage(new Socket());
    incomingMessage.url = url.pathname + url.search;
    req.headers.forEach((value, key) => {
      incomingMessage.headers[key] = value;
    });

    handleConnection(ws, incomingMessage);
  });
}
