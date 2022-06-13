import { routerToServerAndClientNew, waitError } from './__testHelpers';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const trpc = initTRPC()();
const { procedure } = trpc;

test('smoke test - happy', async () => {
  const router = trpc.router({
    queries: {
      hello: procedure.resolve(() => 'world'),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('hello')).toBe('world');
  close();
});

test('smoke test - happy with input', async () => {
  const router = trpc.router({
    queries: {
      greeting: procedure
        .input(z.string())
        .resolve(({ input }) => `hello ${input}`),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('greeting', 'KATT')).toBe('hello KATT');
  close();
});
test('smoke test - sad', async () => {
  const router = trpc.router({
    queries: {
      hello: procedure.resolve(() => 'world'),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);

  // @ts-expect-error this procedure does not exist
  const result = await waitError(client.query('not-found'), TRPCClientError);
  expect(result).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "not-found"]`,
  );
  close();
});
