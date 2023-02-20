import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import * as trpc from '@trpc/server/src';
import { inferRouterMeta } from '@trpc/server/src';
import { observable } from '@trpc/server/src/observable';
import { expectTypeOf } from 'expect-type';

test('route meta types', async () => {
  const testMeta = { data: 'foo' };

  const router = trpc
    .router<any, typeof testMeta>()
    .middleware(({ next }) => {
      return next();
    })
    .query('query', {
      meta: testMeta,
      async resolve({ input }) {
        return { input };
      },
    })
    .subscription('subscription', {
      meta: testMeta,
      async resolve() {
        return observable(() => () => '');
      },
    })
    .mutation('mutation', {
      meta: testMeta,
      async resolve({ input }) {
        return { input };
      },
    })
    .interop();

  type TMeta = inferRouterMeta<typeof router>;
  expectTypeOf<TMeta>().toMatchTypeOf(testMeta);
  expect(router._def.queries).not.toEqual({});
  expect(router._def.queries).toMatchInlineSnapshot(`
    Object {
      "query": [Function],
    }
  `);

  const queryMeta = router['_def']['queries']['query']['meta'];
  expectTypeOf(queryMeta).toMatchTypeOf<TMeta | undefined>();
  expect(queryMeta).toEqual(testMeta);

  const mutationMeta = router['_def']['mutations']['mutation']['meta'];
  expectTypeOf(mutationMeta).toMatchTypeOf<TMeta | undefined>();
  expect(mutationMeta).toEqual(testMeta);

  const subscriptionMeta =
    router['_def']['subscriptions']['subscription']['meta'];
  expectTypeOf(subscriptionMeta).toMatchTypeOf<TMeta | undefined>();
  expect(subscriptionMeta).toEqual(testMeta);
});

test('route meta in middleware', async () => {
  const middleware = vi.fn((opts) => {
    return opts.next();
  });
  const { client, close } = legacyRouterToServerAndClient(
    trpc
      .router<any, { data: string }>()
      .middleware(middleware)
      .query('foo1', {
        meta: {
          data: 'foo1',
        },
        resolve() {
          return 'bar1';
        },
      })
      .mutation('foo2', {
        meta: {
          data: 'foo2',
        },
        resolve() {
          return 'bar2';
        },
      }),
  );

  const calls = middleware.mock.calls;
  expect(await client.query('foo1')).toBe('bar1');
  expect(calls[0]![0]!).toHaveProperty('meta');
  expect(calls[0]![0]!.meta).toEqual({
    data: 'foo1',
  });

  expect(await client.mutation('foo2')).toBe('bar2');
  expect(calls[1]![0]!).toHaveProperty('meta');
  expect(calls[1]![0]!.meta).toEqual({
    data: 'foo2',
  });

  expect(middleware).toHaveBeenCalledTimes(2);
  await close();
});
