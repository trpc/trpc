import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { trpc } from '../src/core';

const t = trpc.create();

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

    const { close, client } = routerToServerAndClientNew<Router>(router);

    const promise = client.query(
      // @ts-expect-error cannot call new procedure with old client
      'testQuery',
      undefined,
      { signal },
    );
    abortController.abort();

    expect(promise).rejects.toThrowError(/aborted/);
    close();
  });

  test.skip('mutation', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const { close, client } = routerToServerAndClientNew<Router>(router);

    const promise = client.mutation(
      // @ts-expect-error cannot call new procedure with old client
      'testMutation',
      undefined,
      { signal },
    );
    abortController.abort();

    expect(promise).rejects.toThrowError(/aborted/);
    close();
  });
});
