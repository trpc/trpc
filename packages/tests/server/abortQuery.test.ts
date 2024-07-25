import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const router = t.router({
  testQuery: t.procedure.query(async () => {
    await waitMs(1000);
    return 'hello';
  }),
  testMutation: t.procedure.mutation(async () => {
    await waitMs(1000);
    return 'hello';
  }),
});
type Router = typeof router;

describe('vanilla client procedure abortion', () => {
  test('query', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const { close, client } = routerToServerAndClientNew(router);

    const promise = client.testQuery.query(undefined, { signal });

    abortController.abort();

    await expect(promise).rejects.toThrowError(/aborted/);
    await close();
  });

  test('mutation', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const { close, client } = routerToServerAndClientNew(router);

    const promise = client.testMutation.mutate(undefined, { signal });

    abortController.abort();

    await expect(promise).rejects.toThrowError(/aborted/);
    await close();
  });
});
