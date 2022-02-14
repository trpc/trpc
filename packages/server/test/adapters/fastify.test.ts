import { inferAsyncReturnType, router, Subscription } from '../../src';
import { createTRPCClient, HTTPHeaders } from '../../../client/src';
import {
  CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from '../../src/adapters/fastify';
import ws from 'fastify-websocket';
import fp from 'fastify-plugin';
import fastify from 'fastify';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { createWSClient, wsLink } from '../../../client/src/links/wsLink';
import { splitLink } from '../../../client/src/links/splitLink';
import { httpLink } from '../../../client/src/links/httpLink';
import { waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { TRPCResult } from '../../src/rpc';

const config = {
  port: 2022,
  logger: false,
  prefix: '/trpc',
};

function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? 'anonymous' };
  return { req, res, user };
}

type Context = inferAsyncReturnType<typeof createContext>;

interface Message {
  id: string;
}

function createAppRouter() {
  const ee = new EventEmitter();
  const onNewMessageSubscription = jest.fn();
  const onSubscriptionEnded = jest.fn();
  const appRouter = router<Context>()
    .query('ping', {
      resolve() {
        return 'pong';
      },
    })
    .query('hello', {
      input: z
        .object({
          username: z.string().nullish(),
        })
        .nullish(),
      resolve({ input, ctx }) {
        return {
          text: `hello ${input?.username ?? ctx.user?.name ?? 'world'}`,
        };
      },
    })
    .mutation('post.edit', {
      input: z.object({
        id: z.string(),
        data: z.object({
          title: z.string(),
          text: z.string(),
        }),
      }),
      async resolve({ input, ctx }) {
        if (ctx.user.name === 'anonymous') {
          return { error: 'Unauthorized user' };
        }
        const { id, data } = input;
        return { id, ...data };
      },
    })
    .subscription('onMessage', {
      resolve() {
        const sub = new Subscription<Message>((emit) => {
          const onMessage = (data: Message) => {
            emit.data(data);
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
      },
    });

  return { appRouter, ee, onNewMessageSubscription, onSubscriptionEnded };
}

type CreateAppRouter = inferAsyncReturnType<typeof createAppRouter>;
type AppRouter = CreateAppRouter['appRouter'];

interface ServerOptions {
  appRouter: AppRouter;
}

function createServer(opts: ServerOptions) {
  const instance = fastify({ logger: config.logger });

  instance.register(ws);
  instance.register(fp(fastifyTRPCPlugin), {
    useWSS: true,
    prefix: config.prefix,
    trpcOptions: { router: opts.appRouter, createContext },
  });

  const stop = () => instance.close();
  const start = async () => {
    try {
      await instance.listen(config.port);
    } catch (err) {
      instance.log.error(err);
      process.exit(1);
    }
  };

  return { instance, start, stop };
}

interface ClientOptions {
  headers?: HTTPHeaders;
}

function createClient(opts: ClientOptions = {}) {
  const host = `localhost:${config.port}${config.prefix}`;
  const wsClient = createWSClient({ url: `ws://${host}` });
  const client = createTRPCClient<AppRouter>({
    headers: opts.headers,
    AbortController: AbortController as any,
    fetch: fetch as any,
    links: [
      splitLink({
        condition(op) {
          return op.type === 'subscription';
        },
        true: wsLink({ client: wsClient }),
        false: httpLink({ url: `http://${host}` }),
      }),
    ],
  });

  return { client, wsClient };
}

interface AppOptions {
  clientOptions?: ClientOptions;
}

function createApp(opts: AppOptions = {}) {
  const { appRouter, ee } = createAppRouter();
  const { instance, start, stop } = createServer({ appRouter });
  const { client } = createClient(opts.clientOptions);

  return { server: instance, start, stop, client, ee };
}

let app: inferAsyncReturnType<typeof createApp>;

describe('anonymous user', () => {
  beforeEach(async () => {
    app = createApp();
    await app.start();
  });

  afterEach(async () => {
    await app.stop();
  });

  test('query', async () => {
    expect(await app.client.query('ping')).toMatchInlineSnapshot(`"pong"`);
    expect(await app.client.query('hello')).toMatchInlineSnapshot(`
          Object {
            "text": "hello anonymous",
          }
      `);
    expect(
      await app.client.query('hello', {
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
      await app.client.mutation('post.edit', {
        id: '42',
        data: { title: 'new_title', text: 'new_text' },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "error": "Unauthorized user",
      }
    `);
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

    const onNext = jest.fn();
    const unsub = app.client.subscription('onMessage', undefined, {
      onNext(data) {
        expectTypeOf(data).not.toBeAny();
        expectTypeOf(data).toMatchTypeOf<TRPCResult<Message>>();
        onNext(data);
      },
    });

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledTimes(3);
    });

    app.ee.emit('server:msg', {
      id: '3',
    });

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledTimes(4);
    });

    expect(onNext.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "type": "started",
          },
        ],
        Array [
          Object {
            "data": Object {
              "id": "1",
            },
            "type": "data",
          },
        ],
        Array [
          Object {
            "data": Object {
              "id": "2",
            },
            "type": "data",
          },
        ],
        Array [
          Object {
            "data": Object {
              "id": "3",
            },
            "type": "data",
          },
        ],
      ]
    `);

    unsub();

    await waitFor(() => {
      expect(app.ee.listenerCount('server:msg')).toBe(0);
      expect(app.ee.listenerCount('server:error')).toBe(0);
    });
  });
});

describe('authorized user', () => {
  beforeEach(async () => {
    app = createApp({ clientOptions: { headers: { username: 'nyan' } } });
    await app.start();
  });

  afterEach(async () => {
    await app.stop();
  });

  test('query', async () => {
    expect(await app.client.query('hello')).toMatchInlineSnapshot(`
      Object {
        "text": "hello nyan",
      }
    `);
  });

  test('mutation', async () => {
    expect(
      await app.client.mutation('post.edit', {
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
