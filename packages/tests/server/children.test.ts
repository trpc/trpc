import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';

test('children', async () => {
  const t = initTRPC.create();

  const router = t.router({
    foo: t.procedure.query(() => 'bar'),
    child: t.router({
      childQuery: t.procedure.query(() => 'asd'),
      grandchild: t.router({
        foo: t.procedure.query(() => 'grandchild' as const),
        mut: t.procedure.mutation(() => 'mut'),
      }),
    }),
  });

  const { procedures } = router._def;
  expect(procedures).toMatchInlineSnapshot(`
    Object {
      "child.childQuery": [Function],
      "child.grandchild.foo": [Function],
      "child.grandchild.mut": [Function],
      "foo": [Function],
    }
  `);

  const { close, client } = routerToServerAndClientNew(router);

  expect(await client.foo.query()).toBe('bar');

  expect(await client.child.grandchild.foo.query()).toBe('grandchild');
  expect(await client.child.grandchild.mut.mutate()).toBe('mut');

  await close();
});

test('w/o children', async () => {
  const t = initTRPC.create();

  const foo = t.procedure.query(() => 'bar');
  const router = t.router({
    foo,
  });

  expect(router._def.procedures.foo).toBe(foo);
});
