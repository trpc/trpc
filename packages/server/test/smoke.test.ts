import { routerToServerAndClientNew } from './__testHelpers';
import { initTRPC } from '@trpc/server';

const trpc = initTRPC()();
const { procedure } = trpc;

test('smoke test', async () => {
  const router = trpc.router({
    queries: {
      hello: procedure.resolve(() => 'world'),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('hello')).toBe('world');
  close();
});
