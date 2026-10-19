/**
 * A Worker that routes `/rooms/:name/trpc` to one Durable Object per room.
 * Each object serves tRPC over hibernating WebSockets: idle connections and
 * open subscriptions don't keep it in memory. Durable calls keep their
 * results, streamed ones too, in the object's storage. `claim` locks a seat
 * through a `Locks` object per seat, `send` is rate limited through a
 * `RateLimits` object per key, and every call's spans are recorded in
 * Workers Traces. `cors()` refuses WebSocket upgrades from other origins.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { DurableObject, tracing } from 'cloudflare:workers';
import {
  experimental_createHibernatingWebSockets,
  experimental_durableLocker,
  experimental_durableLockObject,
  experimental_durableRateLimiterStore,
  experimental_durableRateLimitObject,
  experimental_workersTracer,
  experimental_hibernatingPublisher,
} from '@trpc12/trpc/cloudflare';
import { Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';
import { cors } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter, Messages } from './src/router.ts';
import { durableObjectPersistence } from './src/storage.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LOCKS: DurableObjectNamespace<Locks>;
  RATE_LIMITS: DurableObjectNamespace<RateLimits>;
  GREETING?: string;
}

export class Room extends DurableObject<Env> {
  handler = createFetchHandler<typeof appRouter, { env: Env }>({
    router: appRouter,
    layer: Layer.mergeAll(
      experimental_hibernatingPublisher(Messages, {
        state: this.ctx,
        buffer: 100,
      }),
      durableObjectPersistence(this.ctx.storage),
      experimental_durableLocker(this.env.LOCKS),
      RateLimiter.layer.pipe(
        Layer.provide(
          experimental_durableRateLimiterStore(this.env.RATE_LIMITS),
        ),
      ),
      experimental_workersTracer({
        tracing,
        snapshot: () => AsyncLocalStorage.snapshot(),
      }),
    ),
    createContext: (opts) => ({
      room: opts.request.headers['x-room'] ?? 'unknown',
      greeting: opts.platform?.env.GREETING ?? 'hello',
    }),
    // The browser app's origin; clients that send none, like Node's, pass.
    // `sockets.upgrade()` runs this too, so a cross-origin upgrade gets a 403.
    middleware: [cors({ allowedOrigins: ['https://app.example.com'] })],
  });
  // `x-room` is kept with each socket, so `createContext` still sees it
  // after the object wakes from hibernation.
  sockets = experimental_createHibernatingWebSockets(this.handler, {
    state: this.ctx,
    keepHeaders: ['x-room'],
  });

  override fetch(request: Request): Promise<Response> {
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

/** One lock per name. Holders and waiters keep a hibernatable socket open. */
export class Locks extends DurableObject<Env> {
  locks = experimental_durableLockObject(this.ctx);

  override fetch(request: Request): Response {
    return this.locks.fetch(request);
  }
  override webSocketClose(ws: WebSocket) {
    this.locks.close(ws);
  }
  override webSocketError(ws: WebSocket) {
    this.locks.close(ws);
  }
}

/** One rate limit per key, counted in the object's storage. */
export class RateLimits extends DurableObject<Env> {
  limits = experimental_durableRateLimitObject(this.ctx);

  override fetch(request: Request): Promise<Response> {
    return this.limits.fetch(request);
  }
  override alarm() {
    return this.limits.alarm();
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
