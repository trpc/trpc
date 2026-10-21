/**
 * Chat clients: `wsLink` subscribers and a plain `EventSource` reader that
 * resume from `lastEventId` after leaving, and, given a `Cluster`, after a
 * server restart and after a server drops an idle socket.
 *
 * `node --experimental-eventsource client.ts [url]` calls one running
 * server (Node 24 and 26 keep `EventSource` behind that flag).
 */
import assert from 'node:assert/strict';
import {
  createTrpcClient,
  httpLink,
  isTrpcError,
  routerType,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';
import type { TrackedEnvelope } from '@trpc12/trpc/server';
import { transformer, type AppRouter, type Message } from './server.ts';

/** Subscriptions over a WebSocket, the rest over HTTP. */
function connect(
  url: string,
  opts: { token?: string; keepAlive?: false } = {},
) {
  let connections = 0;
  const ws = wsLink({
    url: url.replace(/^http/, 'ws'),
    transformer,
    // Runs once per connection, so it also counts reconnects.
    connectionParams: () => {
      connections++;
      return opts.token === undefined ? undefined : { token: opts.token };
    },
    // A ping 100 ms after each answer, which may take up to 400 ms.
    keepAlive: opts.keepAlive ?? {
      interval: '100 millis',
      timeout: '400 millis',
    },
    reconnect: { attempts: 50, delay: () => 100 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({
          url,
          transformer,
          headers:
            opts.token === undefined
              ? {}
              : { authorization: `Bearer ${opts.token}` },
        }),
      }),
    ],
  });
  return {
    client,
    connections: () => connections,
    [Symbol.asyncDispose]: () => ws.close(),
  };
}

/** A subscription's events, collected until disposed. */
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
    async [Symbol.asyncDispose]() {
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
  const input = JSON.stringify(transformer.serialize({ room }).json);
  const source = new EventSource(
    `${url}/room?input=${encodeURIComponent(input)}`,
  );
  const events: TrackedEnvelope<Message>[] = [];
  source.onmessage = (event) => {
    const envelope = transformer.deserialize(
      JSON.parse(event.data),
    ) as TrackedEnvelope<Message>;
    assert.equal(envelope.id, event.lastEventId);
    events.push(envelope);
  };
  source.addEventListener('done', () => source.close());
  return {
    events,
    texts: () => events.map((e) => e.data.text),
    opened: () => source.readyState === EventSource.OPEN,
    [Symbol.dispose]: () => source.close(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (what: string, check: () => boolean) => {
  for (let i = 0; i < 1000 && !check(); i++) await sleep(10);
  assert.ok(check(), `timed out waiting for ${what}`);
};

const expectTexts = (who: string, actual: string[], expected: string[]) => {
  assert.deepEqual(actual, expected, who);
  console.log(`  ${who}: ${actual.join(' | ')}`);
};

/** More servers on the same backend, for the scenarios one server can't show. */
export interface Cluster {
  /** Another server; it closes WebSockets that send nothing for a second. */
  readonly other: string;
  /** Stops the server at `url`, runs `whileDown`, and starts it on its port again. */
  readonly restart: (whileDown: () => Promise<void>) => Promise<void>;
}

export async function main(url: string, cluster?: Cluster) {
  // Bob's server: the other one, if there is one.
  const elsewhere = cluster?.other ?? url;
  await using alice = connect(url, { token: 'alice-token' });
  // A fresh room per run, so old runs' history doesn't replay.
  const room = `general-${Date.now()}`;
  const say = (text: string) => alice.client.send.mutate({ room, text });

  // Bob listens (on the other server); Alice posts.
  const lastSeen = await (async () => {
    await using bob = connect(elsewhere, { token: 'bob-token' });
    await using live = collect((signal) =>
      bob.client.room.subscribe({ room }, { signal }),
    );
    await sleep(100);
    await say('hi bob');
    await say('you there?');
    await until('bob, live', () => live.events.length === 2);
    expectTexts(cluster ? 'bob, across servers' : 'bob, live', live.texts(), [
      'hi bob',
      'you there?',
    ]);
    assert.ok(live.events[0]!.data.at instanceof Date, 'expected a Date');
    return live.events.at(-1)!.id;
  })();

  // Bob is gone; Alice keeps posting. Bob comes back on Alice's server and
  // resumes after the last event he saw, from the backend's history.
  await say('missed this one');
  await using bobAgain = connect(url, { token: 'bob-token' });
  {
    await using resumed = collect((signal) =>
      bobAgain.client.room.subscribe(
        { room },
        { signal, lastEventId: lastSeen },
      ),
    );
    await until('bob, resumed', () => resumed.events.length === 1);
    await say('welcome back');
    await until('bob, resumed', () => resumed.events.length === 2);
    expectTexts('bob, resumed', resumed.texts(), [
      'missed this one',
      'welcome back',
    ]);
  }

  // A channel per audience: each inbox gets its owner's messages only, and
  // its channel comes from the token, not from input.
  {
    await using carol = connect(elsewhere, { token: 'carol-token' });
    await using bobInbox = collect((signal) =>
      bobAgain.client.inbox.subscribe(undefined, { signal }),
    );
    await using carolInbox = collect((signal) =>
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
    expectTexts('bob, inbox', bobInbox.texts(), ['for bob']);
    expectTexts('carol, inbox', carolInbox.texts(), ['for carol']);

    await using stranger = connect(elsewhere);
    await assert.rejects(
      async () => {
        for await (const _ of stranger.client.inbox.subscribe()) {
          assert.fail('a stranger read an inbox');
        }
      },
      (cause) => isTrpcError(cause) && cause.code === 'UNAUTHORIZED',
    );
    console.log('  stranger, inbox: UNAUTHORIZED');
  }

  // Bob (wsLink) and a browser tab (EventSource) read the room. With a
  // cluster, Alice's server restarts under them: Alice posts through the
  // other one while it's down, and both readers reconnect on their own and
  // resume from their last event id.
  {
    using tab = readRoom(url, room);
    await using steady = collect((signal) =>
      bobAgain.client.room.subscribe({ room }, { signal }),
    );
    await until('the tab to open', tab.opened);
    await sleep(100);
    await say('before');
    await until(
      'before',
      () => tab.events.length === 1 && steady.events.length === 1,
    );
    const expected = ['before', 'after'];
    if (cluster) {
      await cluster.restart(async () => {
        await using aliceElsewhere = connect(cluster.other, {
          token: 'alice-token',
        });
        await aliceElsewhere.client.send.mutate({
          room,
          text: 'while it was down',
        });
      });
      expected.splice(1, 0, 'while it was down');
      // EventSource waits about 3 s before reconnecting.
      await until(
        'the restart',
        () => tab.events.length === 2 && steady.events.length === 2,
      );
    }
    await say('after');
    await until(
      'after',
      () =>
        tab.events.length === expected.length &&
        steady.events.length === expected.length,
    );
    const label = cluster ? ', restart' : '';
    expectTexts(`tab (EventSource)${label}`, tab.texts(), expected);
    expectTexts(`bob (wsLink)${label}`, steady.texts(), expected);
    assert.equal(bobAgain.connections(), cluster ? 2 : 1, 'bob connections');
  }

  // Keep-alive: the other server closes sockets that send nothing for a
  // second. Bob pings and keeps his connection through quiet seconds; Dave
  // sends no pings, so the server drops him, and he reconnects and resumes.
  if (cluster) {
    await using pinging = connect(cluster.other, { token: 'bob-token' });
    await using silent = connect(cluster.other, { keepAlive: false });
    await using kept = collect((signal) =>
      pinging.client.room.subscribe({ room }, { signal }),
    );
    await using dropped = collect((signal) =>
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
    expectTexts('bob, pinging', kept.texts(), ['quiet now', 'still there?']);
    expectTexts('dave, silent', dropped.texts(), ['quiet now', 'still there?']);
    assert.equal(pinging.connections(), 1, 'pinging connections');
    assert.ok(silent.connections() >= 2, 'silent connections');
    console.log(`  connections: pinging 1, silent ${silent.connections()}`);
  }
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
