import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server/src';
import { inferRouterMeta } from '@trpc/server/src';
import { observable } from '@trpc/server/src/observable';
import { expectTypeOf } from 'expect-type';

test('route meta types', async () => {
  const testMeta = { data: 'foo' };
  const t = initTRPC.meta<typeof testMeta>().create();
  const middleware = t.middleware(async ({ next }) => {
    return next();
  });
  const procedure = t.procedure.use(middleware);

  const router = t.router({
    query: procedure.meta(testMeta).query(({ input }) => {
      input;
    }),
    subscription: procedure
      .meta(testMeta)
      .subscription(() => observable(() => () => '')),
    mutation: procedure.meta(testMeta).mutation(({ input }) => {
      input;
    }),
  });

  type TMeta = inferRouterMeta<typeof router>;
  expectTypeOf<TMeta>().toMatchTypeOf(testMeta);
  expect(router._def.procedures.query).not.toEqual({});
  expect(router._def.procedures.query).toMatchInlineSnapshot(`[Function]`);

  const queryMeta = router['_def']['procedures']['query']['_def']['meta'];
  expectTypeOf(queryMeta).toMatchTypeOf<TMeta | undefined>();
  expect(queryMeta).toEqual(testMeta);

  const mutationMeta = router['_def']['procedures']['mutation']['_def']['meta'];
  expectTypeOf(mutationMeta).toMatchTypeOf<TMeta | undefined>();
  expect(mutationMeta).toEqual(testMeta);

  const subscriptionMeta =
    router['_def']['procedures']['subscription']['_def']['meta'];
  expectTypeOf(subscriptionMeta).toMatchTypeOf<TMeta | undefined>();
  expect(subscriptionMeta).toEqual(testMeta);
});

test('route meta in middleware', async () => {
  const t = initTRPC
    .meta<{
      data: string;
    }>()
    .create();
  const middleware = vi.fn((opts) => {
    return opts.next();
  });

  const procedure = t.procedure.use(middleware);
  const router = t.router({
    foo1: procedure.meta({ data: 'foo1' }).query(() => 'bar1'),
    foo2: procedure.meta({ data: 'foo2' }).mutation(() => 'bar2'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  const calls = middleware.mock.calls;
  expect(await proxy.foo1.query()).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data: 'foo1',
  });

  expect(await proxy.foo2.mutate()).toBe('bar2');
  expect(calls[1]![0]!).toHaveProperty('meta');
  expect(calls[1]![0]!.meta).toEqual({
    data: 'foo2',
  });

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});

test('default meta', async () => {
  const t = initTRPC
    .meta<{
      data: string;
    }>()
    .create({
      defaultMeta: { data: 'foobar' },
    });

  const middleware = vi.fn((opts) => {
    return opts.next();
  });

  const procedure = t.procedure.use(middleware);

  const router = t.router({
    foo1: procedure.query(() => 'bar1'),
    foo2: procedure.mutation(() => 'bar2'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  const calls = middleware.mock.calls;
  expect(await proxy.foo1.query()).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data: 'foobar',
  });

  expect(await proxy.foo2.mutate()).toBe('bar2');
  expect(calls[1]![0]!).toHaveProperty('meta');
  expect(calls[1]![0]!.meta).toEqual({
    data: 'foobar',
  });

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});

test('default meta with merging', async () => {
  const t = initTRPC
    .meta<{
      data: string;
    }>()
    .create({ defaultMeta: { data: 'foobar' } });

  const middleware = vi.fn((opts) => {
    return opts.next();
  });

  const procedure = t.procedure.use(middleware);

  const router = t.router({
    foo1: procedure.meta({ data: 'foo1' }).query(() => 'bar1'),
    foo2: procedure.meta({ data: 'foo2' }).mutation(() => 'bar2'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  const calls = middleware.mock.calls;
  expect(await proxy.foo1.query()).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data: 'foo1',
  });

  expect(await proxy.foo2.mutate()).toBe('bar2');
  expect(calls[1]![0]!).toHaveProperty('meta');
  expect(calls[1]![0]!.meta).toEqual({
    data: 'foo2',
  });

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});

test('meta chaining with merging', async () => {
  const t = initTRPC
    .meta<{
      data: string;
    }>()
    .create();

  const middleware = vi.fn((opts) => {
    return opts.next();
  });

  const procedure = t.procedure.use(middleware);

  const router = t.router({
    foo1: procedure
      .meta({ data: 'foo1' })
      .meta({ data: 'foo2' })
      .query(() => 'bar1'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  const calls = middleware.mock.calls;
  expect(await proxy.foo1.query()).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data: 'foo2',
  });

  expect(middleware).toHaveBeenCalledTimes(1);
  await close();
});

test('complex meta merging', async () => {
  const t = initTRPC
    .meta<{
      data1?: string;
      data2?: number;
      dataObj?: {
        obj1: string;
        obj2: string;
      };
    }>()
    .create({
      defaultMeta: {
        data1: 'foobar',
      },
    });

  const middleware = vi.fn((opts) => {
    return opts.next();
  });

  const procedure = t.procedure.use(middleware);

  const router = t.router({
    foo1: procedure
      .meta({ data2: 11 })
      .meta({ data1: 'bazbar', dataObj: { obj1: 'a', obj2: 'b' } })
      .query(() => 'bar1'),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  const calls = middleware.mock.calls;
  expect(await proxy.foo1.query()).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data1: 'bazbar',
    data2: 11,
    dataObj: {
      obj1: 'a',
      obj2: 'b',
    },
  });

  expect(middleware).toHaveBeenCalledTimes(1);
  await close();
});
