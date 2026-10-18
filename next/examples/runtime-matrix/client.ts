/**
 * The client every runtime gets: the same calls against each one's URL,
 * asserting what comes back. `start.ts` calls `main` with what each runtime
 * should do. `pnpm client [url] [--buffered] [--no-websockets]` runs it
 * against a server you started (default `http://localhost:3000/trpc`).
 */
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
import { allowedOrigin, serializer } from './src/router.ts';

export interface Expected {
  /** Shown in the output; defaults to the runtime the server names. */
  label?: string;
  /** What the `runtime` query must answer. */
  runtime?: string;
  /** Whether a streamed output arrives while it's produced (false: buffered). */
  streams?: boolean;
  /** Whether it serves WebSockets, refusing upgrades from other origins. */
  websockets?: boolean;
}

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
};

/** Runs every check against `url`, the server's `/trpc` endpoint, and logs the ones that passed. */
export async function main(url: string, expected: Expected = {}) {
  const streams = expected.streams ?? true;
  let requests = 0;
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url,
        batch: true,
        serializer,
        fetch: (input, init) => {
          requests++;
          return fetch(input, init);
        },
      }),
    ],
  });

  const runtime = await client.runtime.query();
  const label = expected.label ?? runtime.name;
  const passed: string[] = [];
  const run = async (name: string, body: () => Promise<void>) => {
    try {
      await body();
    } catch (cause) {
      throw new Error(`${label}: ${name} failed`, { cause });
    }
    passed.push(name);
  };

  await run('runtime', async () => {
    if (expected.runtime) assert.equal(runtime.name, expected.runtime);
    if (runtime.name === 'lambda') {
      assert.ok(runtime.requestId, 'no awsRequestId in ctx');
    }
  });

  await run('batch', async () => {
    const before = requests;
    const greetings = await Promise.all([
      client.greet.query({ name: 'ada' }),
      client.greet.query({ name: 'grace' }),
    ]);
    assert.deepEqual(greetings, [
      `hello ada from ${runtime.name}`,
      `hello grace from ${runtime.name}`,
    ]);
    assert.equal(requests - before, 1, 'two queries, one request');
  });

  await run('errors', async () => {
    const [post] = await safe(client.post.query({ id: '1' }));
    assert.equal(post?.id, '1');
    const [, err] = await safe(client.post.query({ id: '404' }));
    assert.ok(err?.defined);
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.data.id, '404');
  });

  await run('rich types', async () => {
    const at = new Date(Date.UTC(2026, 9, 18));
    const tags = new Map([['a', 1]]);
    const echoed = await client.echo.mutate({ at, tags });
    assert.deepEqual(echoed, { at, tags, by: runtime.name });
  });

  await run('files', async () => {
    const file = new File(['bytes from the client'], 'note.txt');
    const uploaded = await client.upload.mutate({ file });
    assert.equal(uploaded.text, 'bytes from the client');
    const download = await client.download.query({ name: 'report.txt' });
    assert.ok(download instanceof File);
    assert.equal(download.name, 'report.txt');
    assert.equal(await download.text(), `made on ${runtime.name}`);
  });

  await run(streams ? 'streaming' : 'buffered', async () => {
    const id = crypto.randomUUID();
    const items: string[] = [];
    for await (const item of await client.countdown.query({ id })) {
      items.push(item);
      if (item === 'first') await client.release.mutate({ id });
    }
    assert.deepEqual(items, ['first', streams ? 'released' : 'timed out']);
  });

  await run('sse resume', async () => {
    const events = await collect(
      client.ticks.subscribe(undefined, { lastEventId: '1' }),
    );
    assert.deepEqual(
      events.map((e) => e.id),
      ['2', '3'],
    );
  });

  await run('cors', async () => {
    const preflight = (origin: string) =>
      fetch(`${url}/echo`, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      }).then((res) => res.headers);
    const allowed = await preflight(allowedOrigin);
    assert.equal(allowed.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(allowed.get('access-control-allow-headers'), 'content-type');
    // A browser blocks the call unless the header names its own origin.
    const other = await preflight('https://evil.example');
    assert.notEqual(
      other.get('access-control-allow-origin'),
      'https://evil.example',
    );
  });

  await run('services', async () => {
    const page = `/home/${crypto.randomUUID()}`;
    const first = await client.visit.mutate({ page });
    const second = await client.visit.mutate({ page });
    assert.deepEqual([first, second], [1, 2]);
  });

  if (expected.websockets ?? true) {
    await run('websocket', async () => {
      const ws = wsLink({ url: url.replace(/^http/, 'ws'), serializer });
      const overWs = createTrpcClient({
        router: routerType<AppRouter>(),
        links: [ws],
      });
      try {
        assert.equal((await overWs.runtime.query()).name, runtime.name);
        const events = await collect(
          overWs.ticks.subscribe(undefined, { lastEventId: '2' }),
        );
        assert.deepEqual(
          events.map((e) => e.id),
          ['3'],
        );
        const id = crypto.randomUUID();
        const items: string[] = [];
        for await (const item of await overWs.countdown.query({ id })) {
          items.push(item);
          if (item === 'first') await overWs.release.mutate({ id });
        }
        assert.deepEqual(items, ['first', 'released']);
      } finally {
        await ws.close();
      }
    });

    await run('websocket origin', async () => {
      const refused = await new Promise<boolean>((resolve) => {
        // Node's WebSocket takes `headers`; the DOM type has only protocols.
        const socket = new WebSocket(url.replace(/^http/, 'ws'), {
          headers: { origin: 'https://evil.example' },
        } as never);
        socket.onopen = () => {
          socket.close();
          resolve(false);
        };
        socket.onerror = () => resolve(true);
      });
      assert.ok(refused, 'a cross-origin upgrade was accepted');
    });
  }

  console.log(`${label.padEnd(20)} ${passed.join(', ')}`);
}

if (import.meta.main) {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      buffered: { type: 'boolean', default: false },
      'no-websockets': { type: 'boolean', default: false },
    },
  });
  await main(args.positionals[0] ?? 'http://localhost:3000/trpc', {
    streams: !args.values.buffered,
    websockets: !args.values['no-websockets'],
  });
}
