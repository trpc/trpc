/**
 * Realtime example: two servers share a Redis-backed `Publisher`; clients
 * subscribe over WebSockets, and a reconnecting client resumes from
 * `lastEventId` without missing events. Needs Redis: `REDIS_URL`, or
 * `redis://127.0.0.1:6379`. Run with `node index.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRedis } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import {
  createTrpcClient,
  httpLink,
  routerType,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';
import { serve } from '@trpc12/trpc/http';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  createFetchHandler,
  initTrpc,
  Publisher,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { z } from 'zod';
import { redisPublisher } from './publisher.ts';

/** Messages carry a `Date`, so both ends use danSON instead of plain JSON. */
const serializer = createSerializer();

interface Message {
  from: string;
  text: string;
  at: Date;
}

class Chat extends Publisher.Service<Chat, { message: Message }>()('Chat') {}

const t = initTrpc();
const appRouter = {
  send: t.procedure
    .input(z.object({ from: z.string(), text: z.string().min(1) }))
    .mutation(({ input }) =>
      Chat.publish('message', { ...input, at: new Date() }),
    ),
  onMessage: t.procedure.subscription((opts) =>
    Chat.subscribe('message', { lastEventId: opts.lastEventId }),
  ),
};
export type AppRouter = typeof appRouter;

const ChatLive = Layer.effect(Chat)(
  // A fresh prefix per run, so old runs' history doesn't replay.
  redisPublisher<{ message: Message }>({ prefix: `chat:${Date.now()}` }),
).pipe(
  Layer.provide(
    NodeRedis.layer({
      url: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
    }),
  ),
);

/** One server process; run as many as you like against the same Redis. */
async function startServer() {
  const handler = createFetchHandler({
    router: appRouter,
    layer: ChatLive,
    serializer,
  });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
      ),
    ),
  );
  const url = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${url}/trpc`,
    async close() {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

const connect = (url: string) => {
  const ws = wsLink({ url: url.replace(/^http/, 'ws'), serializer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({ url, serializer }),
      }),
    ],
  });
  return { client, close: () => ws.close() };
};

const a = await startServer();
const b = await startServer();
const alice = connect(a.url);
const bob = connect(b.url);

/** Reads `count` events, then unsubscribes. */
async function take(
  iterable: AsyncIterable<TrackedEnvelope<Message>>,
  count: number,
  seen: TrackedEnvelope<Message>[],
) {
  for await (const event of iterable) {
    seen.push(event);
    console.log(`  ${event.id} ${event.data.from}: ${event.data.text}`);
    if (seen.length === count) return;
  }
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!check()) throw new Error('timed out');
};

// Bob listens on server B; Alice posts on server A.
console.log('bob, live:');
const seen: TrackedEnvelope<Message>[] = [];
const live = take(bob.client.onMessage.subscribe(), 2, seen);
await new Promise((resolve) => setTimeout(resolve, 100));
await alice.client.send.mutate({ from: 'alice', text: 'hi bob' });
await alice.client.send.mutate({ from: 'alice', text: 'you there?' });
await live;

// Bob is gone; Alice keeps posting.
await bob.close();
await alice.client.send.mutate({ from: 'alice', text: 'missed this one' });

// Bob comes back, this time on server A, and resumes after the last event
// he saw: Redis has the history.
console.log('bob, resumed:');
const bobAgain = connect(a.url);
const resumed: TrackedEnvelope<Message>[] = [];
const again = take(
  bobAgain.client.onMessage.subscribe(undefined, {
    lastEventId: seen.at(-1)!.id,
  }),
  2,
  resumed,
);
await until(() => resumed.length === 1);
await alice.client.send.mutate({ from: 'alice', text: 'welcome back' });
await again;

const texts = resumed.map((e) => e.data.text);
if (texts.join() !== 'missed this one,welcome back') {
  throw new Error(`unexpected events: ${texts.join()}`);
}
if (!(resumed[0]!.data.at instanceof Date)) throw new Error('expected a Date');

await alice.close();
await bobAgain.close();
await Promise.all([a.close(), b.close()]);
