import { observable } from '@trpc/server/observable';
import { AnyRouter } from '@trpc/server/src';
import { createChain } from './createChain';

describe('chain', () => {
  test('trivial', () => {
    const result$ = createChain<AnyRouter, unknown, unknown>({
      links: [
        ({ next, op }) => {
          return observable((observer) => {
            const subscription = next(op).subscribe(observer);
            return () => {
              subscription.unsubscribe();
            };
          });
        },
        ({ op }) => {
          return observable((observer) => {
            observer.next({
              context: {},
              result: {
                type: 'data',
                data: {
                  input: op.input,
                },
              },
            });
            observer.complete();
          });
        },
      ],
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        context: {},
      },
    });

    const next = jest.fn();

    result$.subscribe({ next });
    // console.log(next.mock.calls);
    expect(next).toHaveBeenCalledTimes(1);
  });
  test('multiple responses', () => {
    const result$ = createChain<AnyRouter, unknown, unknown>({
      links: [
        ({ next, op }) => {
          return observable((observer) => {
            observer.next({
              context: {},
              result: {
                type: 'data',
                data: 'from cache',
              },
            });
            const subscription = next(op).subscribe(observer);
            return () => {
              subscription.unsubscribe();
            };
          });
        },
        ({ op }) => {
          return observable((observer) => {
            observer.next({
              result: {
                type: 'data',
                data: {
                  input: op.input,
                },
              },
            });
            observer.complete();
          });
        },
      ],
      op: {
        type: 'query',
        id: 1,
        input: 'world',
        path: 'hello',
        context: {},
      },
    });

    const next = jest.fn();

    result$.subscribe({ next });

    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "context": Object {},
          "result": Object {
            "data": "from cache",
            "type": "data",
          },
        },
      ]
    `);
    expect(next.mock.calls[1]).toMatchInlineSnapshot(`
      Array [
        Object {
          "result": Object {
            "data": Object {
              "input": "world",
            },
            "type": "data",
          },
        },
      ]
    `);
  });
});
