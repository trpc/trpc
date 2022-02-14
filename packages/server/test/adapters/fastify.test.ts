import { inferAsyncReturnType, router } from '@trpc/server';
import { createTRPCClient, HTTPHeaders } from '@trpc/client';
import {
  CreateFastifyContextOptions,
  fastifyTRPCPlugin,
} from '@trpc/server/adapters/fastify';
import ws from 'fastify-websocket';
import fp from 'fastify-plugin';
import fastify from 'fastify';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import { z } from 'zod';

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

function createRouter() {
  return router<Context>();
}

const appRouter = createRouter()
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
  });

type AppRouter = typeof appRouter;

function createServer() {
  const instance = fastify({ logger: config.logger });

  instance.register(ws);
  instance.register(fp(fastifyTRPCPlugin), {
    prefix: config.prefix,
    trpcOptions: { router: appRouter, createContext },
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
  return createTRPCClient<AppRouter>({
    url: `http://localhost:${config.port}${config.prefix}`,
    headers: opts.headers,
    AbortController: AbortController as any,
    fetch: fetch as any,
  });
}

interface AppOptions {
  clientOptions?: ClientOptions;
}

function createApp(opts: AppOptions = {}) {
  const { instance, start, stop } = createServer();
  const client = createClient(opts.clientOptions);

  return { server: instance, start, stop, client };
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
});
