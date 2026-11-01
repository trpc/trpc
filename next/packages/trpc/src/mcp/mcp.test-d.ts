import {
  experimental_createMcpHandler,
  experimental_mcp,
  type McpTool,
} from '@trpc12/trpc/mcp';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { Context, Effect, Layer } from 'effect';
import { expectTypeOf, test } from 'vite-plus/test';

test('the mcp meta key is declared by the extension and typed', () => {
  const t = initTrpc()
    .concat(experimental_openapi())
    .concat(experimental_mcp());
  t.procedure.meta({ mcp: true, route: { method: 'GET' } });
  t.procedure.meta({
    mcp: { description: 'Read', annotations: { readOnlyHint: true } },
  });
  // @ts-expect-error hints are booleans
  t.procedure.meta({ mcp: { annotations: { readOnlyHint: 'yes' } } });

  const plain = initTrpc();
  // @ts-expect-error a root without experimental_mcp() doesn't declare the key
  plain.procedure.meta({ mcp: true });
});

test('createContext and filter are typed by the router', () => {
  interface Ctx {
    user: { admin: boolean } | null;
  }
  const t = initTrpc<{ ctx: Ctx }>().concat(experimental_mcp());
  const router = t.router({
    a: t.procedure.meta({ mcp: true }).query(() => 1),
  });

  experimental_createMcpHandler({
    router,
    createContext: (opts) => {
      expectTypeOf(opts.request.headers['authorization']).toEqualTypeOf<
        string | undefined
      >();
      return { user: null };
    },
    filter: (opts) => {
      expectTypeOf(opts.tool).toEqualTypeOf<McpTool>();
      expectTypeOf(opts.ctx).toEqualTypeOf<Ctx>();
      return opts.ctx.user?.admin === true;
    },
  });
  // @ts-expect-error the router's procedures need ctx
  experimental_createMcpHandler({ router });
});

test('a router that needs services needs a layer, and a platform reaches fetch', () => {
  class Db extends Context.Service<Db, { readonly count: number }>()('Db') {}
  const t = initTrpc();
  const router = t.router({
    count: t.procedure.query(() =>
      Effect.gen(function* () {
        return (yield* Db).count;
      }),
    ),
  });
  // @ts-expect-error `layer` provides Db
  experimental_createMcpHandler({ router });
  const mcp = experimental_createMcpHandler<typeof router, { env: string }>({
    router,
    layer: Layer.succeed(Db, { count: 1 }),
    createContext: (opts) => {
      expectTypeOf(opts.platform).toEqualTypeOf<{ env: string }>();
      return {};
    },
  });
  expectTypeOf(mcp.fetch).parameters.toEqualTypeOf<
    [request: Request, platform: { env: string }]
  >();
});
