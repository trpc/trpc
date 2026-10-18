/**
 * The chat server: rooms anyone can read, and an inbox per user that only
 * its owner can. Both are channels of one `Publisher`, and the backend
 * (Redis or Postgres) is how separate server processes share events.
 *
 * `BACKEND=redis|postgres PORT=3000 node server.ts` serves until SIGTERM
 * and prints `{"url":…}` once it listens. `IDLE_TIMEOUT_MS` closes
 * WebSockets that send nothing, `wsLink`'s pings included, for that long.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRedis, NodeRuntime } from '@effect/platform-node';
import { PgClient } from '@effect/sql-pg';
import { Effect, Layer, Redacted } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  createFetchHandler,
  error,
  initTrpc,
  Publisher,
} from '@trpc12/trpc/server';
import { z } from 'zod';
import { pgPublisher, redisPublisher } from './publisher.ts';

/** Messages carry a `Date`, so both ends use danSON instead of plain JSON. */
export const serializer = createSerializer();

export interface Message {
  from: string;
  text: string;
  at: Date;
}

/** A channel per audience: one per room, one per user's inbox. */
export type ChatEvents = {
  [room: `room:${string}`]: Message;
  [inbox: `inbox:${string}`]: Message;
};

export class Chat extends Publisher.Service<Chat, ChatEvents>()('Chat') {}

const users: Record<string, string> = {
  'alice-token': 'alice',
  'bob-token': 'bob',
  'carol-token': 'carol',
};

const t = initTrpc<{ ctx: { user: string | undefined } }>();

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Send a token' }),
);

const Text = z.string().min(1);

const appRouter = {
  send: authed
    .input(z.object({ room: z.string(), text: Text }))
    .mutation((opts) =>
      Chat.publish(`room:${opts.input.room}`, {
        from: opts.ctx.user,
        text: opts.input.text,
        at: new Date(),
      }),
    ),
  /** Public, so a plain `EventSource` can read it without credentials. */
  room: t.procedure.input(z.object({ room: z.string() })).subscription((opts) =>
    Chat.subscribe(`room:${opts.input.room}`, {
      lastEventId: opts.lastEventId,
    }),
  ),
  dm: authed.input(z.object({ to: z.string(), text: Text })).mutation((opts) =>
    Chat.publish(`inbox:${opts.input.to}`, {
      from: opts.ctx.user,
      text: opts.input.text,
      at: new Date(),
    }),
  ),
  /** The channel comes from `ctx`, never from input: nobody reads another's inbox. */
  inbox: authed.subscription((opts) =>
    Chat.subscribe(`inbox:${opts.ctx.user}`, {
      lastEventId: opts.lastEventId,
    }),
  ),
};
export type AppRouter = typeof appRouter;

export const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
export const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgres://postgres:postgres@127.0.0.1:5432/postgres';

const backends = {
  redis: () =>
    Layer.effect(Chat)(redisPublisher<ChatEvents>({ prefix: 'chat' })).pipe(
      Layer.provide(NodeRedis.layer({ url: redisUrl })),
    ),
  postgres: () =>
    Layer.effect(Chat)(pgPublisher<ChatEvents>()).pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) })),
    ),
};
export type Backend = keyof typeof backends;

if (import.meta.main) {
  const backend = (process.env['BACKEND'] ?? 'redis') as Backend;
  const handler = createFetchHandler({
    router: appRouter,
    layer: backends[backend](),
    serializer,
    // Browsers can't set WebSocket headers, so `wsLink` sends the token as
    // `connectionParams`; over HTTP it's a header.
    createContext: (opts) => {
      const param = opts.info.connectionParams?.['token'];
      const token =
        typeof param === 'string'
          ? param
          : opts.request.headers['authorization']?.replace(/^Bearer /, '');
      return { user: token === undefined ? undefined : users[token] };
    },
    websocket: {
      idleTimeoutMs: Number(process.env['IDLE_TIMEOUT_MS'] ?? 60_000),
    },
  });
  const server = serve(handler).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, {
        port: Number(process.env['PORT'] ?? 3000),
        host: '127.0.0.1',
        // On SIGTERM the server waits this long for open connections to
        // end (20 s by default). Subscriptions never end on their own, so
        // close their sockets soon; clients resume on another server.
        gracefulShutdownTimeout: '500 millis',
      }),
    ),
  );
  Effect.gen(function* () {
    const address = yield* HttpServer.addressFormattedWith(Effect.succeed);
    console.log(JSON.stringify({ url: `${address}/trpc` }));
    return yield* Effect.never;
  }).pipe(
    Effect.provide(server),
    Effect.ensuring(Effect.promise(() => handler.dispose())),
    NodeRuntime.runMain,
  );
}
