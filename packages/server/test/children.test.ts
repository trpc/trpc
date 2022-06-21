import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '../src';

test('children', async () => {
  const t = initTRPC()();

  const router = t.router({
    queries: {
      ttt: t.procedure.resolve(() => 'asd'),
    },
    children: {
      child: t.router({
        queries: {
          childQuery: t.procedure.resolve(() => 'asd'),
        },
        children: {
          grandchild: t.router({
            queries: {
              foo: t.procedure.resolve(() => 'bar' as const),
            },
          }),
        },
      }),
    },
  });

  const { client, close } = routerToServerAndClientNew(router);

  expect(await client.child.grandchild.queries.foo()).toBe('bar');
  client.child.grandchild.queries.foo();
  return close();
});
