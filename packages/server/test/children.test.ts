import { routerToServerAndClientNew } from './___testHelpers';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src';

test('children', async () => {
  const t = initTRPC()();

  const router = t.router({
    foo: t.procedure.query(() => 'bar'),
    child: t.router({
      childQuery: t.procedure.query(() => 'asd'),
      grandchild: t.router({
        getSomething: t.procedure.query(() => 'grandchild' as const),
        doSomething: t.procedure.mutation(() => 'mut'),
      }),
    }),
  });

  const { queries, mutations, subscriptions, procedures } = router._def;
  expect({
    queries,
    mutations,
    subscriptions,
    procedures,
  }).toMatchInlineSnapshot(`
    Object {
      "mutations": Object {
        "child.grandchild.doSomething": [Function],
      },
      "procedures": Object {
        "child.childQuery": [Function],
        "child.grandchild.doSomething": [Function],
        "child.grandchild.getSomething": [Function],
        "foo": [Function],
      },
      "queries": Object {
        "child.childQuery": [Function],
        "child.grandchild.getSomething": [Function],
        "foo": [Function],
      },
      "subscriptions": Object {},
    }
  `);

  const { close, proxy } = routerToServerAndClientNew(router);

  expect(await proxy.foo()).toBe('bar');

  expect(await proxy.child.grandchild.getSomething()).toBe('grandchild');
  expect(await proxy.child.grandchild.doSomething()).toBe('mut');

  return close();
});

test('w/o children', async () => {
  const t = initTRPC()();

  const foo = t.procedure.query(() => 'bar');
  const router = t.router({
    foo,
  });

  expectTypeOf(router._def.procedures.foo).toMatchTypeOf(foo);
});
