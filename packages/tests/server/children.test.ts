import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';

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

  const { close, proxy } = routerToServerAndClientNew(router);

  expect(await proxy.foo.query()).toBe('bar');

  expect(await proxy.child.grandchild.foo.query()).toBe('grandchild');
  expect(await proxy.child.grandchild.mut.mutate()).toBe('mut');

  await close();
});

test('w/o children', async () => {
  const t = initTRPC.create();

  const foo = t.procedure.query(() => 'bar');
  const router = t.router({
    foo,
  });

  expectTypeOf(router._def.procedures.foo).toEqualTypeOf(foo);
});
