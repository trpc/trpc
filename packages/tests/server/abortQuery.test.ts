import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const router = t.router({
  testQuery: t.procedure.query(async () => {
    return 'hello';
  }),
  testMutation: t.procedure.mutation(async () => {
    return 'hello';
  }),
});
type Router = typeof router;

describe('vanilla client procedure abortion', () => {
  test('query', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    await using ctx = testServerAndClientResource(router);

    const promise = ctx.client.testQuery.query(undefined, { signal });

    abortController.abort();

    await expect(promise).rejects.toThrowError(/aborted/);
  });

  test('mutation', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    await using ctx = testServerAndClientResource(router);

    const promise = ctx.client.testMutation.mutate(undefined, { signal });

    abortController.abort();

    await expect(promise).rejects.toThrowError(/aborted/);
  });
});
