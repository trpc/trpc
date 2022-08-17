import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { initTRPC } from '../src/core';

const t = initTRPC()();

const router = t.router({
  test: t.procedure.query(async () => {
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
      'test',
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
