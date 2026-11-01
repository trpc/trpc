import { expectTypeOf, test } from 'vite-plus/test';
import { createTrpcClient, routerType } from '../../client/index.ts';
import {
  createFetchHandler,
  createRouterClient,
  initTrpc,
  mergeRouters,
  middleware,
  type inferRouterContext,
  type inferRouterInputs,
} from '../index.ts';

const t = initTrpc<{ ctx: { user: string } }>();
const db = initTrpc<{ ctx: { db: number } }>();
const withTenant = middleware<{ ctx: { tenant: string } }>()((opts) =>
  opts.next(),
);

const a = t.router({ x: t.procedure.query(() => 1) });
const b = db.router({ y: db.procedure.query(() => 2) });
const root = t.router({
  a,
  b,
  tenant: { z: t.procedure.use(withTenant).query(() => 3) },
});

test('t.router() records the root ctx, and the root collects every one', () => {
  expectTypeOf<inferRouterContext<typeof a>>().toEqualTypeOf<{
    user: string;
  }>();
  expectTypeOf<inferRouterContext<typeof root>>().toEqualTypeOf<{
    user: string;
    db: number;
    tenant: string;
  }>();
});

test('mergeRouters keeps every root ctx, also wrapped in t.router()', () => {
  const merged = mergeRouters(a, b);
  expectTypeOf<inferRouterContext<typeof merged>>().toEqualTypeOf<{
    user: string;
    db: number;
  }>();
  const rewrapped = t.router(mergeRouters(a, b));
  expectTypeOf<inferRouterContext<typeof rewrapped>>().toEqualTypeOf<{
    user: string;
    db: number;
  }>();
});

test('the brand is invisible to router walks', () => {
  type In = inferRouterInputs<typeof root>;
  expectTypeOf<keyof In>().toEqualTypeOf<'a' | 'b' | 'tenant'>();
  const client = createTrpcClient({
    router: routerType<typeof root>(),
    links: [] as never,
  });
  expectTypeOf(client.a.x).toHaveProperty('query');
});

test('handlers type createContext from the brand', () => {
  createFetchHandler({
    router: root,
    createContext: () => ({ user: 'u', db: 1, tenant: 't' }),
  });
  createFetchHandler({
    router: root,
    // @ts-expect-error -- db missing
    createContext: () => ({ user: 'u', tenant: 't' }),
  });
  // @ts-expect-error -- a plain-object root carries no ctx
  createFetchHandler({ router: { x: t.procedure.query(() => 1) } });
});

test('createRouterClient takes the brand ctx', () => {
  createRouterClient(t.router({}), { ctx: { user: 'u' } });
  // @ts-expect-error -- ctx missing
  createRouterClient(t.router({}));
  // @ts-expect-error -- a plain-object root carries no ctx
  createRouterClient({ x: t.procedure.query(() => 1) });
});

test("t.call takes t's ctx and the procedure's middleware needs", () => {
  void t.call(a.x, undefined, { ctx: { user: 'u' } });
  // @ts-expect-error -- ctx missing
  void t.call(a.x, undefined);
  // @ts-expect-error -- tenant missing
  void t.call(root.tenant.z, undefined, { ctx: { user: 'u' } });
  void t.call(root.tenant.z, undefined, { ctx: { user: 'u', tenant: 't' } });
});
