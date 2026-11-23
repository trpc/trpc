// @vitest-environment node
import { EventEmitter } from 'events';
import ws from '@fastify/websocket';
import '@testing-library/react';
import type { HTTPHeaders, TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type {
  CreateFastifyContextOptions,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { broadcastReconnectNotification } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
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
    echo: publicProcedure.input(z.string()).query((opts) => {
      return opts.input;
    }),
    hello: publicProcedure
      .input(
        z
          .object({
            username: z.string().nullish(),
          })
          .nullish(),
      )
      .query((opts) => ({
        text: `hello ${opts.input?.username ?? opts.ctx.user?.name ?? 'world'}`,
      })),
    helloMutation: publicProcedure
      .input(z.string())
      .mutation((opts) => `hello ${opts.input}`),
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
      .mutation(async (opts) => {
        if (opts.ctx.user.name === 'anonymous') {
          return { error: 'Unauthorized user' };
        }
        const { id, data } = opts.input;
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
      info: publicProcedure.query((opts) => {
        return {
          ...opts.ctx.info,
          url: opts.ctx.info.url?.href ?? null,
        };
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
    multipartForm: publicProcedure
      .input(
        z.custom<FormData>((input) => {
          // input instanceof FormData return false but is a FormData type
          // maybe undici version
          // oxlint-disable-next-line typescript/no-base-to-string
          return (input as object).toString() === '[object FormData]';
        }),
      )
      .mutation(async ({ input }) => {
        const result = {} as Record<string, any>;
        result['id'] = (input as any).get('id');
        return result;
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
  keepAlive?: { enabled: boolean; pingMs: number; pongWaitMs: number };
  maxBodySize?: number;
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
      keepAlive: opts.keepAlive,
      maxBodySize: opts.maxBodySize,
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

function createLinkSpy(orderedResults: number[]): TRPCLink<AppRouter> {
  return () => {
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
}

interface ClientOptions {
  headers?: HTTPHeaders;
  port: number | string;
}

function createClient(opts: ClientOptions) {
  const host = `localhost:${opts.port}${config.prefix}`;
  const wsClient = createWSClient({ url: `ws://${host}` });
  const orderedResults: number[] = [];
  const client = createTRPCClient<AppRouter>({
    links: [
      createLinkSpy(orderedResults),
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: splitLink({
          condition(op) {
            return op.input instanceof FormData;
          },
          true: httpLink({
            url: `http://${host}`,
            headers: opts.headers,
          }),
          false: httpBatchStreamLink({
            url: `http://${host}`,
            headers: opts.headers,
          }),
        }),
      }),
    ],
  });

  return { client, wsClient, orderedResults };
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

async function createApp(opts: AppOptions) {
  const { appRouter, ee } = createAppRouter();
  const { instance, stop } = createServer({
    ...(opts.serverOptions ?? {}),
    appRouter,
  });

  const url = new URL(await instance.listen({ port: 0 }));

  const { client, orderedResults } = createClient({
    ...opts.clientOptions,
    port: url.port,
  });

  return makeAsyncResource(
    { server: instance, client, ee, url, opts, orderedResults },
    stop,
  );
}

describe('anonymous user', () => {
  const setup = () => createApp({});

  test('fetch POST', async () => {
    await using app = await setup();
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
    await using app = await setup();
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
    await using app = await setup();
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
    await using app = await setup();
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
    await using app = await setup();
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

  test('broadcastReconnectNotification asks connected clients to reconnect', async () => {
    await using app = await setup();
    const socket = new WebSocket(
      `ws://localhost:${app.url.port}${config.prefix}`,
    );
    // `await using` closes the socket even when an assertion below throws
    await using _socket = makeAsyncResource(socket, () => {
      return new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        socket.once('close', resolve);
        socket.close();
      });
    });

    const received: string[] = [];
    socket.on('message', (data) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      received.push(data.toString());
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

    // the plugin is registered without `fastify-plugin` here, which is fine:
    // `@fastify/websocket` puts `websocketServer` on the root instance
    broadcastReconnectNotification(app.server.websocketServer);

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    expect(JSON.parse(received[0]!)).toEqual({
      id: null,
      method: 'reconnect',
    });
  });

  test('subscription', async () => {
    await using app = await setup();
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

    await vi.waitFor(() => {
      expect(onStartedMock).toHaveBeenCalledTimes(1);
      expect(onDataMock).toHaveBeenCalledTimes(2);
    });

    app.ee.emit('server:msg', {
      id: '3',
    });

    await vi.waitFor(() => {
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

    await vi.waitFor(() => {
      expect(app.ee.listenerCount('server:msg')).toBe(0);
      expect(app.ee.listenerCount('server:error')).toBe(0);
    });
  });

  test('streaming', async () => {
    await using app = await setup();
    const results = await Promise.all([
      app.client.deferred.query({ wait: 3 }),
      app.client.deferred.query({ wait: 1 }),
      app.client.deferred.query({ wait: 2 }),
    ]);
    expect(results).toEqual([3, 1, 2]);
    expect(app.orderedResults).toEqual([1, 2, 3]);
  });
  test('multipart/formdata', async () => {
    await using app = await setup();
    const fd = new FormData();
    fd.set('id', 'bar');

    expect(await app.client.multipartForm.mutate(fd)).toMatchInlineSnapshot(`
    Object {
      "id": "bar",
    }
  `);
  });
});

describe('authorized user', () => {
  const setup = () =>
    createApp({ clientOptions: { headers: { username: 'nyan' } } });

  test('query', async () => {
    await using app = await setup();
    expect(await app.client.hello.query()).toMatchInlineSnapshot(`
      Object {
        "text": "hello nyan",
      }
    `);
  });

  test('request info', async () => {
    await using app = await setup();
    const info = await app.client.request.info.query();

    if (info.url) {
      info.url = info.url.replace(/:\d+\//, ':<<redacted>>/');
    }

    expect(info).toMatchInlineSnapshot(`
      Object {
        "accept": "application/jsonl",
        "calls": Array [
          Object {
            "batchIndex": 0,
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
    await using app = await setup();
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
  const setup = () =>
    createApp({ serverOptions: { fastifyPluginWrapper: true } });

  test('fetch GET', async () => {
    await using app = await setup();
    const req = await fetch(`http://localhost:${app.url.port}/hello`);
    expect(await req.json()).toEqual({ hello: 'GET' });
  });

  test('fetch POST', async () => {
    await using app = await setup();
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
    await using app = await setup();
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
  const setup = () =>
    createApp({
      serverOptions: {
        fastifyPluginWrapper: true,
        withContentTypeParser: true,
      },
    });

  test('query', async () => {
    await using app = await setup();
    expect(await app.client.ping.query()).toMatchInlineSnapshot(`"pong"`);
  });
});

// https://github.com/trpc/trpc/issues/5530
describe('issue #5530 - cannot receive new WebSocket messages after receiving 16 kB', () => {
  const setup = () => createApp({});

  test('query', async () => {
    await using app = await setup();
    const data = 'A'.repeat(8192);

    for (let i = 0; i < 4; i++) {
      expect(await app.client.echo.query(data)).toBe(data);
    }
  });
});

describe('maxBodySize', () => {
  const setup = () => createApp({ serverOptions: { maxBodySize: 1024 } });

  function postForm(app: { url: URL }, id: string) {
    const fd = new FormData();
    fd.set('id', id);
    return globalThis.fetch(
      `http://localhost:${app.url.port}${config.prefix}/multipartForm`,
      { method: 'POST', body: fd },
    );
  }

  test('accepts a multipart body within the limit', async () => {
    await using app = await setup();
    const res = await postForm(app, 'bar');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: { data: { id: 'bar' } } });
  });

  test('rejects a multipart body over the limit', async () => {
    await using app = await setup();
    const res = await postForm(app, 'x'.repeat(10_000));

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      error: { data: { code: 'PAYLOAD_TOO_LARGE' } },
    });
  });
});

describe('issue #7502 - keepAlive must register a single ping interval', () => {
  const pingMs = 250;

  const setup = () =>
    createApp({
      serverOptions: {
        keepAlive: { enabled: true, pingMs, pongWaitMs: 10_000 },
      },
    });

  test('sends one ping per interval', async () => {
    await using app = await setup();
    const socket = new WebSocket(
      `ws://localhost:${app.url.port}${config.prefix}`,
    );

    // keepalive is sent as a "PING" text message, not a protocol ping frame
    let pings = 0;
    socket.on('message', (data) => {
      if (Buffer.isBuffer(data) && data.toString('utf8') === 'PING') {
        pings++;
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('open', () => resolve());
      socket.on('error', reject);
    });

    // a duplicate registration schedules its interval at essentially the same
    // moment as the first, so the extra ping lands well inside one period
    await new Promise((resolve) => setTimeout(resolve, pingMs * 1.5));

    expect(pings).toBe(1);

    socket.close();
  });
});

test('trpcOptions accepts the websocket handler options', () => {
  type TRPCOptions = FastifyTRPCPluginOptions<AppRouter>['trpcOptions'];
  type WSOptions = WSSHandlerOptions<AppRouter>;

  expectTypeOf<TRPCOptions['keepAlive']>().toEqualTypeOf<
    WSOptions['keepAlive']
  >();
  expectTypeOf<TRPCOptions['dangerouslyDisablePong']>().toEqualTypeOf<
    WSOptions['dangerouslyDisablePong']
  >();
  expectTypeOf<TRPCOptions['experimental_encoder']>().toEqualTypeOf<
    WSOptions['experimental_encoder']
  >();
});
