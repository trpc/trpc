import { TRPCError } from '@trpc/server';
import { getTRPCErrorFromUnknown } from '@trpc/server/unstable-core-do-not-import';

test('should extend original Error class', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN' });
  expect(trpcError).toBeInstanceOf(TRPCError);
  expect(trpcError).toBeInstanceOf(Error);
});

test('should populate name field using the class name', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN' });
  expect(trpcError.name).toEqual('TRPCError');
});

test('should use message when one is provided', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN', message: 'wat' });
  expect(trpcError.message).toEqual('wat');
});

test('should fallback to using code as a message when one is not provided', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN' });
  expect(trpcError.message).toEqual('FORBIDDEN');
});

test('should correctly assign the cause when error instance is provided', () => {
  const originalError = new Error('morty');
  const trpcError = new TRPCError({
    code: 'FORBIDDEN',
    cause: originalError,
  });
  expect(trpcError.cause).toBe(originalError);
});

test('should be able to create synthetic cause from string', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN', cause: 'rick' });
  expect(trpcError.cause).toBeInstanceOf(Error);
  expect(trpcError.cause!.message).toBe('rick');
  expect(trpcError.cause!.cause).toBe(undefined);
});

test('should be able to create synthetic cause from object', () => {
  const cause = { foo: 'bar' };
  const trpcError = new TRPCError({ code: 'FORBIDDEN', cause });
  expect(trpcError.cause).toBeInstanceOf(Error);
  expect((trpcError.cause! as Error & typeof cause).foo).toBe('bar');
});

test('should skip creating the cause if one is not provided', () => {
  const trpcError = new TRPCError({ code: 'FORBIDDEN' });
  expect(trpcError.cause).toBeUndefined();
});

describe('getTRPCErrorFromUnknown', () => {
  test('should return same error if its already TRPCError instance', () => {
    const originalError = new TRPCError({ code: 'FORBIDDEN' });
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBe(originalError);
  });

  test('should create new instance of TRPCError with `INTERNAL_SERVER_ERROR` code and same message for non-errors', () => {
    const originalError = 'rick';
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.message).toEqual('rick');
    expect(trpcError.cause!.cause).toBe(undefined);
  });

  test('should create new instance of TRPCError with `INTERNAL_SERVER_ERROR` code and proper cause for errors', () => {
    const originalError = new Error('morty');
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.message).toEqual('morty');
    expect(trpcError.cause).toBe(originalError);
    expect(trpcError.cause?.message).toEqual('morty');
  });

  test('should preserve original stack in case new instance of TRPCError is created', () => {
    const originalError = new Error('picklerick');
    originalError.stack = 'meeseeks';
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError.stack).toEqual('meeseeks');
  });

  test('should create stack in case the cause was not an Error', () => {
    const cause = 'picklyrick';

    const trpcError = getTRPCErrorFromUnknown(cause);
    expect(typeof trpcError.stack).toEqual('string');
  });
});

test('should be extendable', () => {
  class MyError extends TRPCError {
    constructor() {
      super({ code: 'FORBIDDEN' });
      this.name = 'MyError';
    }
  }
  const originalError = new MyError();
  expect(originalError).toBeInstanceOf(TRPCError);
  expect(originalError).toBeInstanceOf(Error);
  expect(originalError).toBeInstanceOf(MyError);

  const trpcError = getTRPCErrorFromUnknown(originalError);
  expect(trpcError).toBe(originalError);
});

test('allows fuzzy matching based on error name', () => {
  class MyError extends Error {
    constructor() {
      super('wat');
      this.name = 'TRPCError';
    }
  }
  const originalError = new MyError();

  const trpcError = getTRPCErrorFromUnknown(originalError);

  expect(trpcError).toBe(originalError);
});
