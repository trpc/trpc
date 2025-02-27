import { EventEmitter } from 'events';
import ws from '@fastify/websocket';
import { waitFor } from '@testing-library/react';
import type { HTTPHeaders, TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  unstable_httpBatchStreamLink,
  wsLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type {
  CreateFastifyContextOptions,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { observable } from '@trpc/server/observable';
import fastify from 'fastify';
import fp from 'fastify-plugin';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import { z } from 'zod';

const config = {
  logger: false,
  prefix: '/trpc',
};

function createContext({ req, res, info }: CreateFastifyContextOptions) {
  const user = { name: req.headers['username'] ?? 'anonymous' };
  return { req, res, user, info };
}

type Context = Awaited<ReturnType<typeof createContext>>;

interface Message {
  id: string;
}

function createAppRouter() {
  const ee = new EventEmitter();
  const onNewMessageSubscription = vi.fn();
  const onSubscriptionEnded = vi.fn();

  const t = initTRPC.context<Context>().create();
  const router = t.router;
  const publicProcedure = t.procedure;

  const appRouter = router({
    ping: publicProcedure.query(() => {
      return 'pong';
    }),
    echo: publicProcedure.input(z.string()).query(({ input }) => {
      return input;
    }),
    hello: publicProcedure
      .input(
        z
          .object({
            username: z.string().nullish(),
          })
          .nullish(),
      )
      .query(({ input, ctx }) => ({
        text: `hello ${input?.username ?? ctx.user?.name ?? 'world'}`,
      })),
    helloMutation: publicProcedure
      .input(z.string())
      .mutation(({ input }) => `hello ${input}`),
    editPost: publicProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            title: z.string(),
            text: z.string(),
          }),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.name === 'anonymous') {
          return { error: 'Unauthorized user' };
        }
        const { id, data } = input;
        return { id, ...data };
      }),
    onMessage: publicProcedure.input(z.string()).subscription(() => {
      const sub = observable<Message>((emit) => {
        const onMessage = (data: Message) => {
          emit.next(data);
        };
        ee.on('server:msg', onMessage);
        return () => {
          onSubscriptionEnded();
          ee.off('server:msg', onMessage);
        };
      });
      ee.emit('subscription:created');
      onNewMessageSubscription();
      return sub;
    }),
    request: router({
      info: publicProcedure.query(({ ctx }) => {
        return ctx.info;
      }),
    }),
    deferred: publicProcedure
      .input(
        z.object({
          wait: z.number(),
        }),
      )
      .query(async (opts) => {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, opts.input.wait * 10),
        );
        return opts.input.wait;
      }),
  });

  return { appRouter, ee, onNewMessageSubscription, onSubscriptionEnded };
}

type CreateAppRouter = Awaited<ReturnType<typeof createAppRouter>>;
type AppRouter = CreateAppRouter['appRouter'];

interface ServerOptions {
  appRouter: AppRouter;
  fastifyPluginWrapper?: boolean;
  withContentTypeParser?: boolean;
}

type PostPayload = { Body: { text: string; life: number } };

function createServer(opts: ServerOptions) {
  const instance = fastify({ logger: config.logger });

  if (opts.withContentTypeParser) {
    instance.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      function (_, body, _done) {
        _done(null, body);
      },
    );
  }

  const plugin = !!opts.fastifyPluginWrapper
    ? fp(fastifyTRPCPlugin)
    : fastifyTRPCPlugin;

  const router = opts.appRouter;

  instance.register(ws);
  instance.register(plugin, {
    useWSS: true,
    prefix: config.prefix,
    trpcOptions: {
      router,
      createContext,
      onError(data) {
        // report to error monitoring
        data;
        // ^?
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  instance.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket) => {
      socket.on('message', (message) => {
        socket.send(message);
      });
    });
  });

  instance.get('/hello', async () => {
    return { hello: 'GET' };
  });

  instance.post<PostPayload>('/hello', async ({ body }) => {
    return { hello: 'POST', body };
  });

  const stop = async () => {
    await instance.close();
  };
  return { instance, stop };
}

const orderedResults: number[] = [];
const linkSpy: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link
    // each link needs to return an observable which propagates results
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          orderedResults.push(value.result.data as number);
          observer.next(value);
        },
        error: observer.error,
      });
      return unsubscribe;
    });
  };
};

interface ClientOptions {
  headers?: HTTPHeaders;
  port: number | string;
}

function createClient(opts: ClientOptions) {
  const host = `localhost:${opts.port}${config.prefix}`;
  const wsClient = createWSClient({ url: `ws://${host}` });
  const client = createTRPCClient<AppRouter>({
    links: [
      linkSpy,
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: unstable_httpBatchStreamLink({
          url: `http://${host}`,
          headers: opts.headers,
          fetch: fetch as any,
        }),
      }),
    ],
  });

  return { client, wsClient };
}

function createBatchClient(opts: ClientOptions) {
  const host = `localhost:${opts.port}${config.prefix}`;
  const client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://${host}`,
        headers: opts.headers,
        fetch: fetch as any,
      }),
    ],
  });

  return { client };
}

interface AppOptions {
  clientOptions?: Partial<ClientOptions>;
  serverOptions?: Partial<ServerOptions>;
}

async function createApp(opts: AppOptions = {}) {
  const { appRouter, ee } = createAppRouter();
  const { instance, stop } = createServer({
    ...(opts.serverOptions ?? {}),
    appRouter,
  });

  const url = new URL(await instance.listen({ port: 0 }));

  const { client } = createClient({ ...opts.clientOptions, port: url.port });

  return { server: instance, stop, client, ee, url, opts };
}

let app: Awaited<ReturnType<typeof createApp>>;

describe('anonymous user', () => {
  beforeEach(async () => {
    orderedResults.length = 0;
    app = await createApp();
  });

  afterEach(async () => {
    await app.stop();
  });

  test('fetch POST', async () => {
    const data = { text: 'life', life: 42 };
    const req = await fetch(`http://localhost:${app.url.port}/hello`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    // body should be object
    expect(await req.json()).toMatchInlineSnapshot(`
      Object {
        "body": Object {
          "life": 42,
          "text": "life",
        },
        "hello": "POST",
      }
    `);
  });

  test('query', async () => {
    expect(await app.client.ping.query()).toMatchInlineSnapshot(`"pong"`);
    expect(await app.client.hello.query()).toMatchInlineSnapshot(`
          Object {
            "text": "hello anonymous",
          }
      `);
    expect(
      await app.client.hello.query({
        username: 'test',
      }),
    ).toMatchInlineSnapshot(`
          Object {
            "text": "hello test",
          }
      `);
  });

  test('mutation', async () => {
    expect(
      await app.client.editPost.mutate({
        id: '42',
        data: { title: 'new_title', text: 'new_text' },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "error": "Unauthorized user",
      }
    `);
  });

  test('batched requests in body work correctly', async () => {
    const { client } = createBatchClient({
      ...app.opts.clientOptions,
      port: app.url.port,
    });

    const res = await Promise.all([
      client.helloMutation.mutate('world'),
      client.helloMutation.mutate('KATT'),
    ]);
    expect(res).toEqual(['hello world', 'hello KATT']);
  });

  test('does not bind other websocket connection', async () => {
    const client = new WebSocket(`ws://localhost:${app.url.port}/ws`);

    await new Promise<void>((resolve, reject) => {
      client.once('open', () => {
        client.send('hello');
        resolve();
      });

      client.once('error', reject);
    });

    const promise = new Promise<string>((resolve) => {
      client.once('message', resolve);
    });

    const message = await promise;

    expect(message.toString()).toBe('hello');

    client.close();
  });

  test('subscription', async () => {
    app.ee.once('subscription:created', () => {
      setTimeout(() => {
        app.ee.emit('server:msg', {
          id: '1',
        });
        app.ee.emit('server:msg', {
          id: '2',
        });
      });
    });

    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const sub = app.client.onMessage.subscribe('onMessage', {
      onStarted: onStartedMock,
      onData(data) {
        expectTypeOf(data).not.toBeAny();
        expectTypeOf(data).toMatchTypeOf<Message>();
        onDataMock(data);
      },
    });

    await waitFor(() => {
      expect(onStartedMock).toHaveBeenCalledTimes(1);
      expect(onDataMock).toHaveBeenCalledTimes(2);
    });

    app.ee.emit('server:msg', {
      id: '3',
    });

    await waitFor(() => {
      expect(onDataMock).toHaveBeenCalledTimes(3);
    });

    expect(onDataMock.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "id": "1",
          },
        ],
        Array [
          Object {
            "id": "2",
          },
        ],
        Array [
          Object {
            "id": "3",
          },
        ],
      ]
    `);

    sub.unsubscribe();

    await waitFor(() => {
      expect(app.ee.listenerCount('server:msg')).toBe(0);
      expect(app.ee.listenerCount('server:error')).toBe(0);
    });
  });

  test('streaming', async () => {
    const results = await Promise.all([
      app.client.deferred.query({ wait: 3 }),
      app.client.deferred.query({ wait: 1 }),
      app.client.deferred.query({ wait: 2 }),
    ]);
    expect(results).toEqual([3, 1, 2]);
    expect(orderedResults).toEqual([1, 2, 3]);
  });
});

describe('authorized user', () => {
  beforeEach(async () => {
    app = await createApp({ clientOptions: { headers: { username: 'nyan' } } });
  });

  afterEach(async () => {
    await app.stop();
  });

  test('query', async () => {
    expect(await app.client.hello.query()).toMatchInlineSnapshot(`
      Object {
        "text": "hello nyan",
      }
    `);
  });

  test('request info', async () => {
    const info = await app.client.request.info.query();

    if (info.url) {
      info.url = info.url.replace(/:\d+\//, ':<<redacted>>/');
    }

    expect(info).toMatchInlineSnapshot(`
      Object {
        "accept": "application/jsonl",
        "calls": Array [
          Object {
            "path": "request.info",
          },
        ],
        "connectionParams": null,
        "isBatchCall": true,
        "signal": Object {},
        "type": "query",
        "url": "http://localhost:<<redacted>>/trpc/request.info?batch=1&input=%7B%7D",
      }
    `);
  });

  test('mutation', async () => {
    expect(
      await app.client.editPost.mutate({
        id: '42',
        data: { title: 'new_title', text: 'new_text' },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "id": "42",
        "text": "new_text",
        "title": "new_title",
      }
    `);
  });
});

describe('anonymous user with fastify-plugin', () => {
  beforeEach(async () => {
    app = await createApp({ serverOptions: { fastifyPluginWrapper: true } });
  });

  afterEach(async () => {
    await app.stop();
  });

  test('fetch GET', async () => {
    const req = await fetch(`http://localhost:${app.url.port}/hello`);
    expect(await req.json()).toEqual({ hello: 'GET' });
  });

  test('fetch POST', async () => {
    const data = { text: 'life', life: 42 };
    const req = await fetch(`http://localhost:${app.url.port}/hello`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    // body should be string
    expect(await req.json()).toMatchInlineSnapshot(`
      Object {
        "body": "{"text":"life","life":42}",
        "hello": "POST",
      }
    `);
  });

  test('query', async () => {
    expect(await app.client.ping.query()).toMatchInlineSnapshot(`"pong"`);
    expect(await app.client.hello.query()).toMatchInlineSnapshot(`
          Object {
            "text": "hello anonymous",
          }
      `);
    expect(
      await app.client.hello.query({
        username: 'test',
      }),
    ).toMatchInlineSnapshot(`
          Object {
            "text": "hello test",
          }
      `);
  });
});

// https://github.com/trpc/trpc/issues/4820
describe('regression #4820 - content type parser already set', () => {
  beforeEach(async () => {
    app = await createApp({
      serverOptions: {
        fastifyPluginWrapper: true,
        withContentTypeParser: true,
      },
    });
  });

  afterEach(async () => {
    await app.stop();
  });

  test('query', async () => {
    expect(await app.client.ping.query()).toMatchInlineSnapshot(`"pong"`);
  });
});

// https://github.com/trpc/trpc/issues/5530
describe('issue #5530 - cannot receive new WebSocket messages after receiving 16 kB', () => {
  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.stop();
  });

  test('query', async () => {
    const data = 'A'.repeat(8192);

    for (let i = 0; i < 4; i++) {
      expect(await app.client.echo.query(data)).toBe(data);
    }
  });
});
