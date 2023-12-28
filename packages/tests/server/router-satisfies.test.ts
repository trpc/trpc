import { AddressInfo } from 'net';
import { AnyRootConfig, initTRPC, TRPCRouter } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import './___packages';
import { createTRPCClient, httpLink } from '@trpc/client';
import { konn } from 'konn';

const createServer = (opts: { router: TRPCRouter; config: AnyRootConfig }) => {
  const httpServer = createHTTPServer({
    // pass the router in, which can be a stupid instance of an object
    router: opts.router,
    // pass the config in, which can be used to access transformer / error formatter
    config: opts.config,
  });

  const server = httpServer.listen(0);
  const httpPort = (server.address() as AddressInfo).port;
  const httpUrl = `http://localhost:${httpPort}`;

  return {
    server,
    httpPort,
    httpUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
};
describe('happy path', () => {
  const t = initTRPC
    .context<{
      superSecretTypeWeDontWantToLeakToNpm: string;
    }>()
    .meta<{
      superSecretTypeWeDontWantToLeakToNpm: string;
    }>()
    .create();

  const appRouter = {
    hello: t.procedure.query(() => 'hello world'),
  } satisfies TRPCRouter;

  const ctx = konn()
    .beforeEach(() => {
      const server = createServer({ config: t._config, router: appRouter });
      return {
        server,
      };
    })
    .afterEach(async (ctx) => {
      await ctx.server?.close();
    })
    .done();

  test('create server', async () => {
    const { server } = ctx;

    const res = await fetch(`${server.httpUrl}/hello`);
    const json = await res.json();

    expect(res.ok).toBe(true);
    expect(json).toMatchInlineSnapshot();

    await server.close();
  });

  test('create client', async () => {
    // only picks the transformer and the error shape
    // hides the Context, etc
    const clientRouter = t.clientRouter(appRouter);

    const client = createTRPCClient<typeof clientRouter>({
      links: [httpLink({ url: ctx.server.httpUrl })],
    });
  });
});

describe('nested routes', () => {
  const t = initTRPC
    .context<{
      superSecretTypeWeDontWantToLeakToNpm: string;
    }>()
    .meta<{
      superSecretTypeWeDontWantToLeakToNpm: string;
    }>()
    .create();

  const appRouter = {
    one: {
      two: {
        three: {
          hello: t.procedure.query(() => 'hello world'),
        },
      },
    },
  } satisfies TRPCRouter;

  const ctx = konn()
    .beforeEach(() => {
      const server = createServer({ config: t._config, router: appRouter });
      return {
        server,
      };
    })
    .afterEach(async (ctx) => {
      await ctx.server?.close();
    })
    .done();

  test('create server', async () => {
    const { server } = ctx;

    const res = await fetch(`${server.httpUrl}/one.two.three.hello`);
    const json = await res.json();

    expect(res.ok).toBe(true);
    expect(json).toMatchInlineSnapshot();

    await server.close();
  });

  test('create client', async () => {
    // only picks the transformer and the error shape
    // hides the Context, etc
    const clientRouter = t.clientRouter(appRouter);

    const client = createTRPCClient<typeof clientRouter>({
      links: [httpLink({ url: ctx.server.httpUrl })],
    });
  });
});
