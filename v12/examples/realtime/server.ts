/**
 * The chat server: rooms anyone can read, and an inbox per user that only
 * its owner can. Both are channels of one `experimental_Publisher`, and the backend
 * (Redis or Postgres) is how separate servers share events.
 *
 * `BACKEND=redis|postgres PORT=3000 node server.ts` serves until Ctrl-C;
 * start a second one on another port to see events cross servers.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRedis } from '@effect/platform-node';
import { PgClient } from '@effect/sql-pg';
import { type Duration, Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import {
  createFetchHandler,
  error,
  initTrpc,
  experimental_Publisher,
} from '@trpc12/trpc/server';
import { z } from 'zod';
import { createEventsTable, pgPublisher, redisPublisher } from './publisher.ts';

/** Messages carry a `Date`, so both ends use progressive JSON instead of plain JSON. */
export const transformer = experimental_createProgressiveJson();

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

export class Chat extends experimental_Publisher.Service<Chat, ChatEvents>()(
  'Chat',
) {}

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

const appRouter = t.router({
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
});
export type AppRouter = typeof appRouter;

const redisUrl = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgres://postgres:postgres@127.0.0.1:5432/postgres';

const backends = {
  redis: () =>
    Layer.effect(Chat)(redisPublisher<ChatEvents>({ prefix: 'chat' })).pipe(
      Layer.provide(NodeRedis.layer({ url: redisUrl })),
    ),
  // Creates its table on start; in production, run that as a migration.
  postgres: () =>
    Layer.effect(Chat)(
      Effect.andThen(createEventsTable, pgPublisher<ChatEvents>()),
    ).pipe(Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))),
};
export type Backend = keyof typeof backends;

/**
 * Starts a server; run as many as you like against the same backend.
 * `idleTimeout` closes WebSockets that send nothing, `wsLink`'s pings
 * included, for that long.
 */
export async function listen(
  port = 0,
  opts: { backend?: Backend; idleTimeout?: Duration.Input } = {},
) {
  const handler = createFetchHandler({
    router: appRouter,
    layer: backends[opts.backend ?? 'redis'](),
    transformer,
    // Browsers can't set WebSocket headers, so `wsLink` sends the token as
    // `connectionParams`; over HTTP it's a header.
    createContext: (o) => {
      const param = o.info.connectionParams?.['token'];
      const token =
        typeof param === 'string'
          ? param
          : o.request.headers['authorization']?.replace(/^Bearer /, '');
      return { user: token === undefined ? undefined : users[token] };
    },
    websocket: { idleTimeout: opts.idleTimeout ?? '60 seconds' },
  });
  const server = createServer();
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(() => server, {
          port,
          host: '127.0.0.1',
          // On close, the server waits this long for open connections to
          // end (20 s by default). Subscriptions never end on their own, so
          // close their sockets soon; clients resume on another server.
          gracefulShutdownTimeout: '500 millis',
        }),
      ),
    ),
  );
  const address = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return {
    url: `${address}/trpc`,
    async [Symbol.asyncDispose]() {
      await runtime.dispose();
      // Connections that went idle while closing stay open, and a request
      // on one would reach no handler, so a client reusing it would hang.
      server.closeAllConnections();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000), {
    backend: (process.env['BACKEND'] ?? 'redis') as Backend,
  });
  console.log(`listening on ${server.url}`);
}
