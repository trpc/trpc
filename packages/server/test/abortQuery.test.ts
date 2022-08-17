import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { initTRPC } from '../src/core';

const t = initTRPC()();

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

describe('queries can be aborted by passing a signal', () => {
  test('abort', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const { close, client } = routerToServerAndClientNew<Router>(router);

    const promise = client.query(
      // @ts-expect-error cannot call new procedure with old client
      'testQuery',
      {},
      {
        context: {
          signal,
        },
      },
    );
    abortController.abort();

    expect(promise).rejects.toThrowError(/aborted/);
    close();
  });
});

describe('mutations should not be aborted', () => {
  test('abort', async () => {
    const abortController = new AbortController();
    const signal = abortController.signal;

    const { close, client } = routerToServerAndClientNew<Router>(router);

    const promise = client.mutation(
      // @ts-expect-error cannot call new procedure with old client
      'testMutation',
      {},
      {
        context: {
          signal,
        },
      },
    );
    abortController.abort();

    expect(promise).resolves.toBe('hello');
    close();
  });
});
