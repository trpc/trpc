import { routerToServerAndClientNew } from './___testHelpers';
import { expectTypeOf } from 'expect-type';
import { initTRPC } from '../src';

test('children', async () => {
  const t = initTRPC()();

  const router = t.router({
    queries: {
      foo: t.procedure.resolve(() => 'bar'),
    },
    children: {
      child: t.router({
        queries: {
          childQuery: t.procedure.resolve(() => 'asd'),
        },
        children: {
          grandchild: t.router({
            queries: {
              foo: t.procedure.resolve(() => 'grandchild' as const),
            },
          }),
        },
      }),
    },
  });

  const { queries, mutations, subscriptions } = router;
  expect({ queries, mutations, subscriptions }).toMatchInlineSnapshot(`
    Object {
      "mutations": Object {},
      "queries": Object {
        "child.childQuery": [Function],
        "child.grandchild.foo": [Function],
        "foo": [Function],
      },
      "subscriptions": Object {},
    }
  `);

  const { client, close } = routerToServerAndClientNew(router);

  expect(await client.queries.foo()).toBe('bar');

  expect(await client.child.grandchild.queries.foo()).toBe('grandchild');

  return close();
});

test('w/o children', async () => {
  const t = initTRPC()();

  const router = t.router({
    queries: {
      foo: t.procedure.resolve(() => 'bar'),
    },
  });
  const children = router.children;
  //     ^?
  expectTypeOf(children).toBeUndefined();
});
