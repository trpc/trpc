import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import type { Observable} from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

async function consumeObservable<T>(observable: Observable<T, TRPCError>) {
  const values: T[] = [];

  await new Promise((resolve, reject) => {
    observable.subscribe({
      next(value) {
        values.push(value);
      },
      complete() {
        resolve(values);
      },
      error(error) {
        reject(error);
      },
    });
  });

  return values;
}

async function consumeAsyncIterable<T>(iterable: AsyncIterable<T>) {
  const values: T[] = [];

  for await (const value of iterable) {
    values.push(value);
  }

  return values;
}

describe('subscription output parser', () => {
  const t = initTRPC.create();

  describe('Observable', () => {
    test('without output parser', async () => {
      const appRouter = t.router({
        hello: t.procedure
          .subscription(() => observable<string>((emit) => {
            emit.next('hello');
            emit.next('world');
            emit.complete();
          })),
      });

      const caller = t.createCallerFactory(appRouter)({});
      const result = await caller.hello();

      expectTypeOf(result).toEqualTypeOf<Observable<string, TRPCError>>();
      expect(await consumeObservable(result)).toEqual(['hello', 'world']);
    });

    test('with output parser', async () => {
      const appRouter = t.router({
        hello: t.procedure
          .output(z.string().transform((value) => value.toUpperCase()))
          .subscription(() => observable((emit) => {
            emit.next('hello');
            emit.next('world');
            emit.complete();
          })),
      });

      const caller = t.createCallerFactory(appRouter)({});
      const result = await caller.hello();

      expectTypeOf(result).toEqualTypeOf<Observable<string, TRPCError>>();
      expect(await consumeObservable(result)).toEqual(['HELLO', 'WORLD']);
    });
  });

  describe('AsyncGenerator', () => {
    test('without output parser', async () => {
      const appRouter = t.router({
        hello: t.procedure
          .subscription(async function* () {
            yield 'hello';
            yield 'world';
          }),
      });

      const caller = t.createCallerFactory(appRouter)({});
      const result = await caller.hello();

      expectTypeOf(result).toEqualTypeOf<AsyncIterable<"hello" | "world">>();
      expect(await consumeAsyncIterable(result)).toEqual(['hello', 'world']);
    });

    test('with output parser', async () => {
      const appRouter = t.router({
        hello: t.procedure
          .output(z.string().transform((value) => value.toUpperCase()))
          .subscription(async function* () {
            yield 'hello';
            yield 'world';
          }),
      });

      const caller = t.createCallerFactory(appRouter)({});
      const result = await caller.hello();

      expectTypeOf(result).toEqualTypeOf<AsyncIterable<string>>();
      expect(await consumeAsyncIterable(result)).toEqual(['HELLO', 'WORLD']);
    });
  });
});
