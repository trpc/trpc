import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { EventEmitter } from 'events';
import { TRPCClientError, TRPCLink } from '../../client';
import {
  httpBatchLink,
  httpLink,
  splitLink,
  wsLink,
} from '../../client/src/links';
import { observable } from '../observable';
import { TRPCError, initTRPC } from '../src';

test('httpLink returns error to link correctly', async () => {
  const t = initTRPC()();

  const router = t.router({
    regular: t.procedure.query(() => {
      return { ok: true };
    }),
    error: t.procedure.query(() => {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Fake unauthorized error',
      });
    }),
  });

  const nextFunction = jest.fn();
  const errorFunction = jest.fn();
  const completeFunction = jest.fn();
  const customLink: TRPCLink<typeof router> = () => {
    return ({ next, op }) => {
      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            nextFunction();
            observer.next(value);
          },
          error(err) {
            errorFunction();
            observer.error(err);
          },
          complete() {
            completeFunction();
            observer.complete();
          },
        });
      });
    };
  };

  const { proxy, close } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [customLink, httpLink({ url: httpUrl })],
      };
    },
  });

  expect(await proxy.regular.query()).toEqual({ ok: true });
  expect(nextFunction).toHaveBeenCalledTimes(1);
  expect(errorFunction).toHaveBeenCalledTimes(0);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  const error = await waitError(proxy.error.query(), TRPCClientError);
  expect(error.data.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('Fake unauthorized error');
  expect(nextFunction).toHaveBeenCalledTimes(1);
  expect(errorFunction).toHaveBeenCalledTimes(1);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  return close();
});

test('httpBatchLink returns error to link correctly', async () => {
  const t = initTRPC()();

  const router = t.router({
    regular: t.procedure.query(() => {
      return { ok: true };
    }),
    error: t.procedure.query(() => {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Fake unauthorized error',
      });
    }),
  });

  const nextFunction = jest.fn();
  const errorFunction = jest.fn();
  const completeFunction = jest.fn();
  const customLink: TRPCLink<typeof router> = () => {
    return ({ next, op }) => {
      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            nextFunction();
            observer.next(value);
          },
          error(err) {
            errorFunction();
            observer.error(err);
          },
          complete() {
            completeFunction();
            observer.complete();
          },
        });
      });
    };
  };

  const { proxy, close } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [customLink, httpBatchLink({ url: httpUrl })],
      };
    },
  });

  expect(await proxy.regular.query()).toEqual({ ok: true });
  expect(nextFunction).toHaveBeenCalledTimes(1);
  expect(errorFunction).toHaveBeenCalledTimes(0);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  const error = await waitError(proxy.error.query(), TRPCClientError);
  expect(error.data.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('Fake unauthorized error');
  expect(nextFunction).toHaveBeenCalledTimes(1);
  expect(errorFunction).toHaveBeenCalledTimes(1);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  return close();
});

test('wsLink returns error to link correctly', async () => {
  const t = initTRPC()();

  const ee = new EventEmitter();
  const router = t.router({
    regular: t.procedure.query(() => {
      ee.emit('query', { ok: true });
      return { ok: true };
    }),
    error: t.procedure.query(() => {
      ee.emit('query', { ok: false });
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Fake unauthorized error',
      });
    }),
    onQuery: t.procedure.subscription(() => {
      return observable<{ ok: boolean }, TRPCError>((emit) => {
        const onQuery = (data: { ok: boolean }) => {
          if (data.ok) {
            emit.next(data);
          } else {
            emit.error(
              new TRPCError({
                code: 'FORBIDDEN',
                message: 'Emitting an error',
              }),
            );
          }
        };

        ee.on('query', onQuery);

        return () => {
          ee.off('query', onQuery);
        };
      });
    }),
  });

  const nextFunction = jest.fn();
  const errorFunction = jest.fn();
  const completeFunction = jest.fn();
  const customLink: TRPCLink<typeof router> = () => {
    return ({ next, op }) => {
      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            nextFunction();
            observer.next(value);
          },
          error(err) {
            errorFunction();
            observer.error(err);
          },
          complete() {
            completeFunction();
            observer.complete();
          },
        });
      });
    };
  };

  const { client, proxy, close } = routerToServerAndClientNew(router, {
    client({ wsClient, httpUrl }) {
      return {
        links: [
          customLink,
          splitLink({
            condition(op) {
              return op.type === 'subscription';
            },
            true: wsLink({ client: wsClient }),
            false: httpLink({ url: httpUrl }),
          }),
        ],
      };
    },
  });

  const subNextFunction = jest.fn();
  const subErrorFunction = jest.fn();
  const subCompleteFunction = jest.fn();
  const unsub = client.subscription('onQuery', undefined, {
    next() {
      subNextFunction();
    },
    error() {
      subErrorFunction();
    },
    complete() {
      subCompleteFunction();
    },
  });

  expect(await proxy.regular.query()).toEqual({ ok: true });
  expect(nextFunction).toHaveBeenCalledTimes(1);
  expect(errorFunction).toHaveBeenCalledTimes(0);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  const error = await waitError(proxy.error.query(), TRPCClientError);
  expect(error.data.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('Fake unauthorized error');
  expect(nextFunction).toHaveBeenCalledTimes(2);
  expect(errorFunction).toHaveBeenCalledTimes(2);
  expect(completeFunction).toHaveBeenCalledTimes(1);

  unsub.unsubscribe();
  expect(subNextFunction).toHaveBeenCalledTimes(1);
  expect(subErrorFunction).toHaveBeenCalledTimes(1);
  expect(subCompleteFunction).toHaveBeenCalledTimes(0);

  await close();
});
