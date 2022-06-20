import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '../src';

test('children', async () => {
  const t = initTRPC()();

  const router = t.router({
    children: {
      child: t.router({
        children: {
          grandchild: t.router({
            queries: {
              foo: () => 'bar',
            },
          }),
        },
      }),
    },
  });

  const { client, close } = routerToServerAndClientNew(router);

  // FIXME
  expect(await client.child.grandchild.queries.foo()).toBe('bar');
  // alt impl:
  // expect(await client.children.child.grandchild.queries.foo()).toBe('bar');
  return close();
});
