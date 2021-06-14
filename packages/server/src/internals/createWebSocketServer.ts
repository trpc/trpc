/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import WebSocket from 'ws';
import { CreateContextFn, CreateContextFnOptions } from '../http';
import { AnyRouter } from '../router';
import { WSSHandlerOptions } from '../ws/wssHandler';

export type CreateWebSocketContextOptions = CreateContextFnOptions<
  http.IncomingMessage,
  WebSocket
>;

export type CreateWebSocketContextFn<TRouter extends AnyRouter> =
  CreateContextFn<TRouter, http.IncomingMessage, http.ServerResponse>;

export type CreateWebSocketServerOptions<TRouter extends AnyRouter> = Omit<
  WSSHandlerOptions<TRouter>,
  'wss'
>;
// export function createWebSocketServer<TRouter extends AnyRouter>(
//   opts: CreateWebSocketServerOptions<TRouter>,
// ) {
//   const server = http.createServer();

//   const wss = new WebSocket.Server({ server });
//   applyWSSHandler({ ...opts, wss });
//   return {
//     server,
//     wss,
//     listen(port?: number) {
//       server.listen(port);
//       const actualPort =
//         port === 0 ? ((server.address() as any).port as number) : port;

//       return {
//         port: actualPort,
//       };
//     },
//   };
// }
