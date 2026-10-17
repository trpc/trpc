import { MessageChannel, type MessagePort } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string } }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const router = {
  hello: t.procedure.query((opts) => `hello ${opts.ctx.user}`),
  slow: t.procedure.query(async () => {
    await sleep(50);
    return 'slow';
  }),
  later: t.procedure.query(() => ({
    now: 1,
    missing: Promise.reject(error({ code: 'NOT_FOUND', message: 'gone' })),
    crash: Promise.reject(new Error('internal detail')),
  })),
  ticks: t.procedure.input(z.number()).subscription(async function* (opts) {
    for (let i = 0; i < opts.input; i++) {
      yield i;
      await sleep(5);
    }
  }),
};

const handler = createFetchHandler({
  router,
  exposeUnexpectedErrors: false,
  createContext: (opts) => {
    const user = opts.info.connectionParams?.['user'];
    if (user === 'boom') throw new Error('createContext failed');
    return { user: typeof user === 'string' ? user : 'ada' };
  },
});

/** A Node port behind the Web-style surface: `addEventListener`, no `on`. */
function webPort(port: MessagePort) {
  const listeners: Array<(event: { data: unknown }) => void> = [];
  port.on('message', (data: unknown) => {
    for (const l of listeners) l({ data });
  });
  const closers: Array<() => void> = [];
  port.on('close', () => closers.forEach((c) => c()));
  return {
    sent: [] as unknown[],
    postMessage(message: unknown) {
      this.sent.push(message);
      port.postMessage(message);
    },
    addEventListener(type: string, listener: (event: any) => void) {
      if (type === 'message') listeners.push(listener);
      if (type === 'close') closers.push(() => listener({}));
    },
    /** Delivers a message as if the other end had sent it. */
    inject(data: unknown) {
      for (const l of listeners) l({ data });
    },
    close: () => port.close(),
  };
}

/** The raw end of a channel whose other end the handler serves. */
function serve() {
  const channel = new MessageChannel();
  const { port2 } = channel;
  handler.messagePort(webPort(channel.port1));
  const replies: Array<Record<string, unknown>> = [];
  const waiters: Array<() => void> = [];
  port2.on('message', (message: Record<string, unknown>) => {
    replies.push(message);
    waiters.splice(0).forEach((w) => w());
  });
  const closed = new Promise<void>((resolve) => port2.once('close', resolve));
  return {
    send: (message: unknown) => port2.postMessage(message),
    replies,
    closed,
    until: async (count: number) => {
      while (replies.length < count) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      return replies;
    },
    [Symbol.dispose]: () => port2.close(),
  };
}

test('the server answers invalid messages, ids, types, paths and methods', async () => {
  using port = serve();
  port.send('not an object');
  port.send({ type: 'request', method: 'query', path: 'hello' });
  port.send({ type: 'what' });
  port.send({ id: 1, type: 'request', method: 'query', path: 'nowhere' });
  port.send({ id: 2, type: 'request', method: 'mutation', path: 'hello' });
  port.send({ id: 3, type: 'request', method: 'query', path: 'slow' });
  port.send({ id: 3, type: 'request', method: 'query', path: 'slow' });
  const replies = await port.until(7);
  const errors = replies
    .filter((r) => r['type'] === 'error')
    .map((r) => [
      r['id'],
      (r['body'] as { json: { error: { message: string } } }).json.error
        .message,
    ]);
  expect(errors).toEqual(
    expect.arrayContaining([
      [null, 'Invalid message'],
      [null, 'Each request needs a unique numeric id'],
      [null, 'Unknown message'],
      [1, 'No procedure at path "nowhere"'],
      [2, '"hello" is a query, not a mutation'],
      [null, 'Each request needs a unique numeric id'],
    ]),
  );
  expect(replies).toContainEqual({
    id: 3,
    type: 'result',
    body: { json: 'slow' },
  });
});

test('a failing createContext fails the call by id; a wrong version closes the port', async () => {
  using port = serve();
  port.send({
    type: 'init',
    version: '12',
    connectionParams: { user: 'boom' },
  });
  port.send({ id: 1, type: 'request', method: 'query', path: 'hello' });
  const [, failed] = await port.until(2);
  expect(failed).toMatchObject({
    id: 1,
    type: 'error',
    body: { json: { error: { code: 'INTERNAL_SERVER_ERROR' } } },
  });
  expect(JSON.stringify(failed)).not.toContain('createContext failed');

  port.send({ type: 'init', version: '11' });
  await port.closed;
  expect(port.replies[2]).toMatchObject({
    id: null,
    type: 'error',
    body: { json: { error: { code: 'UNSUPPORTED_PROTOCOL' } } },
  });
});

test('deferred rejections over a port become wire errors, unexpected ones hidden', async () => {
  const channel = new MessageChannel();
  handler.messagePort(channel.port1);
  const link = experimental_messagePortLink({ port: webPort(channel.port2) });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  try {
    const out = await client.later.query();
    expect(out.now).toBe(1);
    await expect(out.missing).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'gone',
    });
    const [, crash] = await safe(out.crash);
    expect(crash).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(String(crash)).not.toContain('internal detail');
  } finally {
    await link.close();
    channel.port1.close();
  }
});

test('the client ignores stray messages and fails calls on connection errors', async () => {
  const channel = new MessageChannel();
  handler.messagePort(channel.port1);
  const port = webPort(channel.port2);
  const link = experimental_messagePortLink({ port });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const idOf = (path: string) =>
    (port.sent as Array<{ id: number; path?: string }>)
      .filter((m) => m.path === path)
      .at(-1)!.id;
  try {
    const slow = safe(client.slow.query());
    await sleep(5);
    port.inject(5);
    port.inject(null);
    port.inject({ id: null, type: 'result', body: { json: 1 } });
    port.inject({ id: idOf('slow'), type: 'weird' });
    port.inject({
      id: null,
      type: 'error',
      body: {
        json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'draining' } },
      },
    });
    expect((await slow).error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'draining',
    });

    const events: number[] = [];
    for await (const n of client.ticks.subscribe(3)) {
      events.push(n);
      if (n === 0) {
        port.inject({ id: idOf('ticks'), type: 'weird' });
      }
    }
    expect(events).toEqual([0, 1, 2]);

    // After close(), the next call opens the port again.
    await link.close();
    expect(await client.hello.query()).toBe('hello ada');
  } finally {
    await link.close();
    channel.port1.close();
  }
});
