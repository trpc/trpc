/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import WebSocket from 'ws';
import { CreateContextFn, CreateContextFnOptions } from '../http';
import { AnyRouter } from '../router';
import { webSocketHandler, WebSocketHandlerOptions } from './websocketHandler';

export type CreateWebSocketContextOptions = CreateContextFnOptions<
  http.IncomingMessage,
  WebSocket
>;

export type CreateWebSocketContextFn<TRouter extends AnyRouter> =
  CreateContextFn<TRouter, http.IncomingMessage, http.ServerResponse>;

export function createWebSocketServer<TRouter extends AnyRouter>(
  opts: Omit<WebSocketHandlerOptions<TRouter>, 'wss'>,
) {
  const server = http.createServer();

  const wss = new WebSocket.Server({ server });
  webSocketHandler({ ...opts, wss });
  return {
    wss,
    listen(port?: number) {
      server.listen(port);
      const actualPort =
        port === 0 ? ((server.address() as any).port as number) : port;

      return {
        port: actualPort,
      };
    },
  };
}
