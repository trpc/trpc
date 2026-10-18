/**
 * Realtime example: chat server processes that share a `Publisher` on Redis
 * or on Postgres. Clients subscribe over WebSockets, or read the SSE
 * endpoint with a plain `EventSource`, and resume from `lastEventId` after
 * leaving, after a server restart and after a server drops an idle socket.
 * Needs Redis (`REDIS_URL`, or `redis://127.0.0.1:6379`) and Postgres
 * (`DATABASE_URL`, or `postgres://postgres:postgres@127.0.0.1:5432/postgres`).
 * Run with `pnpm smoke`; Node 24 needs `--experimental-eventsource`.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { PgClient } from '@effect/sql-pg';
import { Effect, Redacted } from 'effect';
import {
  createTrpcClient,
  httpLink,
  isTrpcError,
  routerType,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';
import type { TrackedEnvelope } from '@trpc12/trpc/server';
import { createEventsTable } from './publisher.ts';
import {
  databaseUrl,
  serializer,
  type AppRouter,
  type Backend,
  type Message,
} from './server.ts';

// Migrations run once, before any server starts.
await Effect.runPromise(
  createEventsTable.pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(databaseUrl) })),
  ),
);

// --- servers -------------------------------------------------------------------------

const running = new Set<ReturnType<typeof spawn>>();
process.on('exit', () => {
  for (const child of running) child.kill();
});

/** A `server.ts` process; `stop()` sends SIGTERM and waits for it to exit. */
async function startServer(opts: {
  backend: Backend;
  port?: number;
  idleTimeoutMs?: number;
}) {
  const child = spawn(process.execPath, ['server.ts'], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      BACKEND: opts.backend,
      PORT: String(opts.port ?? 0),
      IDLE_TIMEOUT_MS: String(opts.idleTimeoutMs ?? 60_000),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  running.add(child);
  const exited = once(child, 'exit');
  const [line] = (await Promise.race([
    once(createInterface({ input: child.stdout! }), 'line'),
    exited.then(() => {
      throw new Error('the server exited before listening');
    }),
  ])) as [string];
  const url: string = JSON.parse(line).url;
  return {
    url,
    port: Number(new URL(url).port),
    async stop() {
      child.kill('SIGTERM');
      await exited;
      running.delete(child);
    },
  };
}

// --- clients -------------------------------------------------------------------------

/** Subscriptions over a WebSocket, the rest over HTTP. */
function connect(
  url: string,
  opts: { token?: string; keepAlive?: false } = {},
) {
  let connections = 0;
  const ws = wsLink({
    url: url.replace(/^http/, 'ws'),
    serializer,
    // Runs once per connection, so it also counts reconnects.
    connectionParams: () => {
      connections++;
      return opts.token === undefined ? undefined : { token: opts.token };
    },
    // A ping 100 ms after each answer, which may take up to 400 ms.
    keepAlive: opts.keepAlive ?? { intervalMs: 100, timeoutMs: 400 },
    reconnect: { attempts: 50, delayMs: () => 100 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({
          url,
          serializer,
          headers:
            opts.token === undefined
              ? {}
              : { authorization: `Bearer ${opts.token}` },
        }),
      }),
    ],
  });
  return { client, connections: () => connections, close: () => ws.close() };
}

/** A subscription's events, collected until `stop()`. */
function collect(
  subscribe: (signal: AbortSignal) => AsyncIterable<TrackedEnvelope<Message>>,
) {
  const controller = new AbortController();
  const events: TrackedEnvelope<Message>[] = [];
  const done = (async () => {
    try {
      for await (const event of subscribe(controller.signal)) {
        events.push(event);
      }
    } catch (cause) {
      if (!controller.signal.aborted) throw cause;
    }
  })();
  return {
    events,
    texts: () => events.map((e) => e.data.text),
    async stop() {
      controller.abort();
      await done;
    },
  };
}

/**
 * A room read with a plain `EventSource`, as a browser would. Input goes in
 * the query string as `httpLink` sends it; each event's `data` is the
 * serialized `tracked()` envelope. On a dropped connection it reconnects by
 * itself with `Last-Event-ID`.
 */
function readRoom(url: string, room: string) {
  const input = JSON.stringify(serializer.serialize({ room }).json);
  const source = new EventSource(
    `${url}/room?input=${encodeURIComponent(input)}`,
  );
  const events: TrackedEnvelope<Message>[] = [];
  source.onmessage = (event) => {
    const envelope = serializer.deserialize(
      JSON.parse(event.data),
    ) as TrackedEnvelope<Message>;
    if (envelope.id !== event.lastEventId) throw new Error('expected the id');
    events.push(envelope);
  };
  source.addEventListener('done', () => source.close());
  return {
    events,
    texts: () => events.map((e) => e.data.text),
    opened: () => source.readyState === EventSource.OPEN,
    close: () => source.close(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (what: string, check: () => boolean) => {
  for (let i = 0; i < 1000 && !check(); i++) await sleep(10);
  if (!check()) throw new Error(`timed out waiting for ${what}`);
};

const expectTexts = (who: string, actual: string[], expected: string[]) => {
  if (actual.join('|') !== expected.join('|')) {
    throw new Error(
      `${who} got ${actual.join('|')}, not ${expected.join('|')}`,
    );
  }
  console.log(`  ${who}: ${actual.join(' | ')}`);
};

// --- scenarios -----------------------------------------------------------------------

for (const backend of ['redis', 'postgres'] as const) {
  console.log(`${backend}:`);
  const a = await startServer({ backend });
  // B drops sockets that send nothing for a second.
  const b = await startServer({ backend, idleTimeoutMs: 1000 });
  const alice = connect(a.url, { token: 'alice-token' });
  // A fresh room per run, so old runs' history doesn't replay.
  const room = `general-${Date.now()}`;
  const say = (text: string) => alice.client.send.mutate({ room, text });

  // Bob listens on server B; Alice posts on server A.
  const bob = connect(b.url, { token: 'bob-token' });
  const live = collect((signal) =>
    bob.client.room.subscribe({ room }, { signal }),
  );
  await sleep(100);
  await say('hi bob');
  await say('you there?');
  await until('bob, live', () => live.events.length === 2);
  await live.stop();
  await bob.close();
  expectTexts('bob, across servers', live.texts(), ['hi bob', 'you there?']);
  if (!(live.events[0]!.data.at instanceof Date)) {
    throw new Error('expected a Date');
  }

  // Bob is gone; Alice keeps posting. Bob comes back on server A and
  // resumes after the last event he saw, from the backend's history.
  await say('missed this one');
  const bobAgain = connect(a.url, { token: 'bob-token' });
  const resumed = collect((signal) =>
    bobAgain.client.room.subscribe(
      { room },
      { signal, lastEventId: live.events.at(-1)!.id },
    ),
  );
  await until('bob, resumed', () => resumed.events.length === 1);
  await say('welcome back');
  await until('bob, resumed', () => resumed.events.length === 2);
  await resumed.stop();
  expectTexts('bob, resumed', resumed.texts(), [
    'missed this one',
    'welcome back',
  ]);

  // A channel per audience: each inbox gets its owner's messages only, and
  // its channel comes from the token, not from input.
  const carol = connect(b.url, { token: 'carol-token' });
  const bobInbox = collect((signal) =>
    bobAgain.client.inbox.subscribe(undefined, { signal }),
  );
  const carolInbox = collect((signal) =>
    carol.client.inbox.subscribe(undefined, { signal }),
  );
  await sleep(100);
  await alice.client.dm.mutate({ to: 'carol', text: 'for carol' });
  await alice.client.dm.mutate({ to: 'bob', text: 'for bob' });
  await until(
    'the inboxes',
    () => bobInbox.events.length === 1 && carolInbox.events.length === 1,
  );
  await sleep(50);
  await Promise.all([bobInbox.stop(), carolInbox.stop()]);
  expectTexts('bob, inbox', bobInbox.texts(), ['for bob']);
  expectTexts('carol, inbox', carolInbox.texts(), ['for carol']);
  const stranger = connect(b.url);
  try {
    for await (const _ of stranger.client.inbox.subscribe()) {
      throw new Error('a stranger read an inbox');
    }
    throw new Error('expected UNAUTHORIZED');
  } catch (cause) {
    if (!isTrpcError(cause) || cause.code !== 'UNAUTHORIZED') throw cause;
    console.log('  stranger, inbox: UNAUTHORIZED');
  }
  await Promise.all([carol.close(), stranger.close()]);

  // A server restart mid-subscription. Bob (wsLink) and a browser tab
  // (EventSource) read the room on server A; A stops, Alice posts through
  // B, and A comes back on the same port. Both reconnect on their own and
  // resume from their last event id.
  const tab = readRoom(a.url, room);
  const steady = collect((signal) =>
    bobAgain.client.room.subscribe({ room }, { signal }),
  );
  await until('the tab to open', tab.opened);
  await sleep(100);
  await say('before the restart');
  await until(
    'before the restart',
    () => tab.events.length === 1 && steady.events.length === 1,
  );
  await a.stop();
  const aliceOnB = connect(b.url, { token: 'alice-token' });
  await aliceOnB.client.send.mutate({ room, text: 'while A was down' });
  const aAgain = await startServer({ backend, port: a.port });
  // EventSource waits about 3 s before reconnecting.
  await until(
    'the restart',
    () => tab.events.length === 2 && steady.events.length === 2,
  );
  await say('after the restart');
  await until(
    'after the restart',
    () => tab.events.length === 3 && steady.events.length === 3,
  );
  const restart = [
    'before the restart',
    'while A was down',
    'after the restart',
  ];
  expectTexts('tab (EventSource), restart', tab.texts(), restart);
  expectTexts('bob (wsLink), restart', steady.texts(), restart);
  if (bobAgain.connections() !== 2) {
    throw new Error(`bob connected ${bobAgain.connections()} times, not 2`);
  }
  tab.close();
  await steady.stop();

  // Keep-alive: B drops sockets that send nothing for a second. Bob pings
  // and keeps his connection through quiet seconds; Dave sends no pings,
  // so B drops him, and he reconnects and resumes.
  const pinging = connect(b.url, { token: 'bob-token' });
  const silent = connect(b.url, { keepAlive: false });
  const kept = collect((signal) =>
    pinging.client.room.subscribe({ room }, { signal }),
  );
  const dropped = collect((signal) =>
    silent.client.room.subscribe({ room }, { signal }),
  );
  await sleep(100);
  await say('quiet now');
  await until(
    'quiet now',
    () => kept.events.length === 1 && dropped.events.length === 1,
  );
  await sleep(2500);
  await say('still there?');
  await until(
    'still there?',
    () => kept.events.length === 2 && dropped.events.length === 2,
  );
  await Promise.all([kept.stop(), dropped.stop()]);
  expectTexts('bob, pinging', kept.texts(), ['quiet now', 'still there?']);
  expectTexts('dave, silent', dropped.texts(), ['quiet now', 'still there?']);
  if (pinging.connections() !== 1 || silent.connections() < 2) {
    throw new Error(
      `connections: pinging ${pinging.connections()}, silent ${silent.connections()}`,
    );
  }
  console.log(`  connections: pinging 1, silent ${silent.connections()}`);

  await Promise.all([
    alice.close(),
    aliceOnB.close(),
    bobAgain.close(),
    pinging.close(),
    silent.close(),
  ]);
  await Promise.all([aAgain.stop(), b.stop()]);
}
