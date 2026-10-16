/**
 * A Worker that routes `/rooms/:name/trpc` to one Durable Object per room.
 * Each object serves tRPC over hibernating WebSockets: idle connections and
 * open subscriptions don't keep it in memory.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  experimental_createHibernatingWebSockets,
  hibernatingPublisher,
} from 'trpcdev/cloudflare';
import { createFetchHandler } from 'trpcdev/server';
import { appRouter, Messages } from './router.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  GREETING?: string;
}

export class Room extends DurableObject<Env> {
  handler = createFetchHandler<typeof appRouter, { env: Env }>({
    router: appRouter,
    layer: hibernatingPublisher(Messages, { state: this.ctx, buffer: 100 }),
    createContext: ({ request, platform }) => ({
      room: request.headers['x-room'] ?? 'unknown',
      greeting: platform?.env.GREETING ?? 'hello',
    }),
  });
  // `x-room` is kept with each socket, so `createContext` still sees it
  // after the object wakes from hibernation.
  sockets = experimental_createHibernatingWebSockets(this.handler, {
    state: this.ctx,
    keepHeaders: ['x-room'],
  });

  override fetch(request: Request): Response | Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return this.handler.fetch(request, { env: this.env });
    }
    return this.sockets.upgrade(request, { env: this.env });
  }
  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.sockets.message(ws, message, { env: this.env });
  }
  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.sockets.close(ws, code, reason);
  }
  override webSocketError(ws: WebSocket) {
    this.sockets.close(ws);
  }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/rooms\/([^/]+)(\/trpc(?:\/.*)?)$/.exec(url.pathname);
    if (!match) return new Response('Not found', { status: 404 });
    const [, room, rest] = match as unknown as [string, string, string];
    url.pathname = rest;
    const forwarded = new Request(url, request);
    forwarded.headers.set('x-room', decodeURIComponent(room));
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(forwarded);
  },
} satisfies ExportedHandler<Env>;
