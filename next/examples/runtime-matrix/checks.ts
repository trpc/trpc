/**
 * The checks every runtime runs: the same client calls against each one's
 * URL. A failing check throws with the runtime's name.
 */
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
  wsLink,
} from '@trpc12/trpc/client';
import { allowedOrigin, serializer, type AppRouter } from './src/router.ts';

export interface Target {
  /** Shown in the results. */
  label: string;
  /** What the `runtime` query should answer. */
  runtime: string;
  /** Whether a streamed output arrives while it's produced (false: buffered). */
  streams: boolean;
  /** Whether it serves WebSockets, refusing upgrades from other origins. */
  websockets: boolean;
}

const assert = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
};

/** Runs every check against `url`, the runtime's `/trpc` endpoint; returns their names. */
export async function check(target: Target, url: string): Promise<string[]> {
  const passed: string[] = [];
  const run = async (name: string, body: () => Promise<void>) => {
    try {
      await body();
    } catch (cause) {
      throw new Error(`${target.label}: ${name} failed`, { cause });
    }
    passed.push(name);
  };

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

  await run('runtime', async () => {
    const runtime = await client.runtime.query();
    assert(runtime.name === target.runtime, `answered ${runtime.name}`);
    if (target.runtime === 'lambda') {
      assert(runtime.requestId !== undefined, 'no awsRequestId in ctx');
    }
  });

  await run('batch', async () => {
    const before = requests;
    const greetings = await Promise.all([
      client.greet.query({ name: 'ada' }),
      client.greet.query({ name: 'grace' }),
    ]);
    assert(
      greetings[1] === `hello grace from ${target.runtime}`,
      `got ${greetings.join()}`,
    );
    assert(requests - before === 1, `${requests - before} requests`);
  });

  await run('errors', async () => {
    const [post] = await safe(client.post.query({ id: '1' }));
    assert(post?.id === '1', 'no post 1');
    const [, err] = await safe(client.post.query({ id: '404' }));
    assert(
      err?.defined === true &&
        err.code === 'NOT_FOUND' &&
        err.data.id === '404',
      `got ${err?.code}`,
    );
  });

  await run('rich types', async () => {
    const at = new Date(Date.UTC(2026, 9, 18));
    const echoed = await client.echo.mutate({ at, tags: new Map([['a', 1]]) });
    assert(echoed.at instanceof Date && +echoed.at === +at, 'Date lost');
    assert(
      echoed.tags instanceof Map && echoed.tags.get('a') === 1,
      'Map lost',
    );
  });

  await run('files', async () => {
    const file = new File(['bytes from the client'], 'note.txt');
    const uploaded = await client.upload.mutate({ file });
    assert(uploaded.text === 'bytes from the client', `got ${uploaded.text}`);
    const download = await client.download.query({ name: 'report.txt' });
    assert(download instanceof File, 'not a File');
    assert(download.name === 'report.txt', `named ${download.name}`);
    const text = await download.text();
    assert(text === `made on ${target.runtime}`, `got ${text}`);
  });

  await run(target.streams ? 'streaming' : 'buffered', async () => {
    const id = crypto.randomUUID();
    const items: string[] = [];
    for await (const item of await client.countdown.query({ id })) {
      items.push(item);
      if (item === 'first') await client.release.mutate({ id });
    }
    const expected = target.streams ? 'released' : 'timed out';
    assert(items.join() === `first,${expected}`, `got ${items.join()}`);
  });

  await run('sse resume', async () => {
    const events = await collect(
      client.ticks.subscribe(undefined, { lastEventId: '1' }),
    );
    assert(events.map((e) => e.id).join() === '2,3', 'did not resume');
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
    assert(
      allowed.get('access-control-allow-origin') === allowedOrigin,
      'the allowed origin was refused',
    );
    assert(
      allowed.get('access-control-allow-headers') === 'content-type',
      'content-type was not allowed',
    );
    // A browser blocks the call unless the header names its own origin.
    const other = await preflight('https://evil.example');
    assert(
      other.get('access-control-allow-origin') !== 'https://evil.example',
      'another origin was allowed',
    );
  });

  await run('services', async () => {
    const page = `/home/${crypto.randomUUID()}`;
    const first = await client.visit.mutate({ page });
    const second = await client.visit.mutate({ page });
    assert(first === 1 && second === 2, `counted ${first}, ${second}`);
  });

  if (!target.websockets) return passed;

  await run('websocket', async () => {
    const ws = wsLink({ url: url.replace(/^http/, 'ws'), serializer });
    const overWs = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [ws],
    });
    try {
      const runtime = await overWs.runtime.query();
      assert(runtime.name === target.runtime, `answered ${runtime.name}`);
      const events = await collect(
        overWs.ticks.subscribe(undefined, { lastEventId: '2' }),
      );
      assert(events.map((e) => e.id).join() === '3', 'did not resume');
      const id = crypto.randomUUID();
      const items: string[] = [];
      for await (const item of await overWs.countdown.query({ id })) {
        items.push(item);
        if (item === 'first') await overWs.release.mutate({ id });
      }
      assert(items.join() === 'first,released', `got ${items.join()}`);
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
    assert(refused, 'a cross-origin upgrade was accepted');
  });

  return passed;
}
