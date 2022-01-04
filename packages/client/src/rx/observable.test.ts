/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import { AnyRouter, TRPCError } from '@trpc/server';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { executeChain, OperationLink, TRPCLink } from '../links2/core';
import { dedupeLink } from '../links2/dedupeLink';
import { splitLink } from '../links2/splitLink';
import { observable } from './observable';
import { error, map } from './operators';
import { share } from './operators/share';

test('vanilla observable', () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
    observer.complete();
  });

  const next = jest.fn();
  const error = jest.fn();
  const complete = jest.fn();
  obs.subscribe({
    next,
    error,
    complete,
  });
  expect(next.mock.calls).toHaveLength(1);
  expect(complete.mock.calls).toHaveLength(1);
  expect(error.mock.calls).toHaveLength(0);
  expect(next.mock.calls[0][0]).toBe(1);
});

test('share', () => {
  const obs = share()(
    observable<number, Error>((observer) => {
      observer.next(1);
    }),
  );
  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0][0]).toBe(1);
  }

  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }
});

test('pipe', () => {
  const obs = observable<number, Error>((observer) => {
    observer.next(1);
  }).pipe(share());
  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(1);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
    expect(next.mock.calls[0][0]).toBe(1);
  }

  {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    obs.subscribe({
      next,
      error,
      complete,
    });
    expect(next.mock.calls).toHaveLength(0);
    expect(complete.mock.calls).toHaveLength(0);
    expect(error.mock.calls).toHaveLength(0);
  }
});

interface SubscriptionEvents<TOutput> {
  data: (data: TOutput) => void;
}
declare interface CustomEventEmitter<TOutput> {
  on<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  once<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  emit<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    ...args: Parameters<SubscriptionEvents<TOutput>[U]>
  ): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomEventEmitter<TOutput> extends EventEmitter {}

test('map', () => {
  type EventShape = { num: number };
  const ee = new CustomEventEmitter<EventShape>();
  const eventObservable = observable<EventShape, unknown>((subscriber) => {
    const callback = (data: EventShape) => {
      subscriber.next(data);
    };
    ee.on('data', callback);

    return () => {
      ee.off('data', callback);
    };
  });
  const pipeCalls = jest.fn();
  const piped = eventObservable.pipe(
    map((...args) => {
      pipeCalls(...args);
      const [value] = args;
      return value.num;
    }),
  );

  const next = jest.fn();
  const subscription = piped.subscribe({
    next(value) {
      expectTypeOf<number>(value);
      next(value);
    },
  });
  expect(next).not.toHaveBeenCalled();
  ee.emit('data', { num: 1 });
  ee.emit('data', { num: 2 });
  expect(next).toHaveBeenCalledTimes(2);
  expect(next.mock.calls).toEqual([[1], [2]]);
  expect(pipeCalls.mock.calls).toEqual([
    [{ num: 1 }, 0],
    [{ num: 2 }, 1],
  ]);

  expect(ee.listeners('data')).toHaveLength(1);
  subscription.unsubscribe();
  expect(ee.listeners('data')).toHaveLength(0);
});

test('error', () => {
  class CustomError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CustomError';

      Object.setPrototypeOf(this, new.target.prototype);
    }
  }
  function getErrorFromUnknown(cause: unknown): TRPCError {
    if (cause instanceof TRPCError) {
      return cause as TRPCError;
    }
    const err = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      cause,
    });

    return err;
  }

  const observer = observable<number>((observer) => {
    observer.error(new CustomError('Some error'));
  }).pipe(error((error) => getErrorFromUnknown(error)));

  const errorSpy = jest.fn();
  const sub = observer.subscribe({
    error(err) {
      expectTypeOf<TRPCError>(err);
      errorSpy(err);
    },
  });

  expect(errorSpy).toHaveBeenCalledTimes(1);

  const err = errorSpy.mock.calls[0][0];
  expect(err).toBeInstanceOf(TRPCError);
  expect(err.cause).toBeInstanceOf(CustomError);

  sub.unsubscribe();
});

describe('chain', () => {
  test('trivial', () => {
    const result$ = executeChain<AnyRouter, unknown, unknown>({
      links: [
        ({ next, op }) => {
          return observable((observer) => {
            const next$ = next(op).subscribe(observer);
            return () => {
              next$.unsubscribe();
            };
          });
        },
        ({ op }) => {
          return observable((subscribe) => {
            subscribe.next({
              id: null,
              result: {
                type: 'data',
                data: {
                  input: op.input,
                },
              },
            });
            subscribe.complete();
          });
        },
      ],
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });

    const next = jest.fn();

    result$.subscribe({ next });
    console.log(next.mock.calls);
    expect(next).toHaveBeenCalledTimes(1);
  });
  test('multiple responses', () => {
    const result$ = executeChain<AnyRouter, unknown, unknown>({
      links: [
        ({ next, op }) => {
          return observable((observer) => {
            observer.next({
              id: null,
              result: {
                type: 'data',
                data: 'from cache',
              },
            });
            const next$ = next(op).subscribe(observer);
            return () => {
              next$.unsubscribe();
            };
          });
        },
        ({ op }) => {
          return observable((subscribe) => {
            subscribe.next({
              id: null,
              result: {
                type: 'data',
                data: {
                  input: op.input,
                },
              },
            });
            subscribe.complete();
          });
        },
      ],
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });

    const next = jest.fn();

    result$.subscribe({ next });
    console.log(next.mock.calls);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0][0].result.data).toBe('from cache');
    expect(next.mock.calls[1][0].result.data).toEqual({
      input: 'world',
    });
  });
});

test('dedupe', async () => {
  const endingLinkTriggered = jest.fn();
  const timerTriggered = jest.fn();
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    dedupeLink()(null as any),
    ({ op }) => {
      return observable((subscribe) => {
        endingLinkTriggered();
        const timer = setTimeout(() => {
          timerTriggered();
          subscribe.next({
            id: null,
            result: {
              type: 'data',
              data: {
                input: op.input,
              },
            },
          });
          subscribe.complete();
        }, 1);
        return () => clearTimeout(timer);
      });
    },
  ];
  {
    const call1 = executeChain<AnyRouter, unknown, unknown>({
      links,
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });

    const call2 = executeChain<AnyRouter, unknown, unknown>({
      links,
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });
    const next = jest.fn();
    call1.subscribe({ next });
    call2.subscribe({ next });

    expect(endingLinkTriggered).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(timerTriggered).toHaveBeenCalledTimes(1);
    });

    expect(next).toHaveBeenCalledTimes(2);
  }
});

test('dedupe - cancel one does not cancel the other', async () => {
  const endingLinkTriggered = jest.fn();
  const timerTriggered = jest.fn();
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    dedupeLink()(null as any),
    ({ op }) => {
      return observable((subscribe) => {
        endingLinkTriggered();
        const timer = setTimeout(() => {
          timerTriggered();
          subscribe.next({
            id: null,
            result: {
              type: 'data',
              data: {
                input: op.input,
              },
            },
          });
          subscribe.complete();
        }, 1);
        return () => clearTimeout(timer);
      });
    },
  ];

  {
    const call1 = executeChain<AnyRouter, unknown, unknown>({
      links,
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });

    const call2 = executeChain<AnyRouter, unknown, unknown>({
      links,
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        meta: {},
      },
    });
    const next = jest.fn();
    const call1$ = call1.subscribe({ next });
    call2.subscribe({ next });
    call1$.unsubscribe();

    expect(endingLinkTriggered).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(timerTriggered).toHaveBeenCalledTimes(1);

      expect(next).toHaveBeenCalledTimes(1);
    });
  }
});

test('splitLink', () => {
  const wsLinkSpy = jest.fn();
  const wsLink: TRPCLink<any> = () => () =>
    observable(() => {
      wsLinkSpy();
    });
  const httpLinkSpy = jest.fn();
  const httpLink: TRPCLink<any> = () => () =>
    observable(() => {
      httpLinkSpy();
    });
  const links: OperationLink<AnyRouter, any, any>[] = [
    // "dedupe link"
    splitLink({
      condition(op) {
        return op.type === 'subscription';
      },
      true: wsLink,
      false: [httpLink],
    })(null as any),
  ];

  executeChain({
    links,
    op: {
      type: 'query',
      input: null,
      path: '.',
      id: 0,
      meta: {},
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(1);
  expect(wsLinkSpy).toHaveBeenCalledTimes(0);
  jest.resetAllMocks();

  executeChain({
    links,
    op: {
      type: 'subscription',
      input: null,
      path: '.',
      id: 0,
      meta: {},
    },
  }).subscribe({});
  expect(httpLinkSpy).toHaveBeenCalledTimes(0);
  expect(wsLinkSpy).toHaveBeenCalledTimes(1);
});
