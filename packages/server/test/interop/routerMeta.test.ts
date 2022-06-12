import { routerToServerAndClient } from '../__testHelpers';
import { expectTypeOf } from 'expect-type';
import * as trpc from '../../src';
import { inferRouterMeta } from '../../src';
import { observable } from '../../src/observable';

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
    });

  type TMeta = inferRouterMeta<typeof router>;

  const queryMeta = router['_def']['queries']['query']['meta'];
  expectTypeOf(queryMeta).toMatchTypeOf<TMeta>();
  expect(queryMeta).toEqual(testMeta);

  const mutationMeta = router['_def']['mutations']['mutation']['meta'];
  expectTypeOf(mutationMeta).toMatchTypeOf<TMeta>();
  expect(mutationMeta).toEqual(testMeta);

  const subscriptionMeta =
    router['_def']['subscriptions']['subscription']['meta'];
  expectTypeOf(subscriptionMeta).toMatchTypeOf<TMeta>();
  expect(subscriptionMeta).toEqual(testMeta);
});

test('route meta in middleware', async () => {
  const middleware = jest.fn((opts) => {
    return opts.next();
  });
  const { client, close } = routerToServerAndClient(
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
  expect(calls[0][0]).toHaveProperty('meta');
  expect(calls[0][0].meta).toEqual({
    data: 'foo1',
  });

  expect(await client.mutation('foo2')).toBe('bar2');
  expect(calls[1][0]).toHaveProperty('meta');
  expect(calls[1][0].meta).toEqual({
    data: 'foo2',
  });

  expect(middleware).toHaveBeenCalledTimes(2);
  close();
});
