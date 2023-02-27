import { TRPCError, getTRPCErrorFromUnknown } from '@trpc/server/src';

describe('TRPCError', () => {
  it('should extend original Error class', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN' });
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError).toBeInstanceOf(Error);
  });

  it('should populate name field using the class name', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN' });
    expect(trpcError.name).toEqual('TRPCError');
  });

  it('should use message when one is provided', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN', message: 'wat' });
    expect(trpcError.message).toEqual('wat');
  });

  it('should fallback to using code as a message when one is not provided', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN' });
    expect(trpcError.message).toEqual('FORBIDDEN');
  });

  it('should correctly assign the cause when error instance is provided', () => {
    const originalError = new Error('morty');
    const trpcError = new TRPCError({
      code: 'FORBIDDEN',
      cause: originalError,
    });
    expect(trpcError.cause).toBe(originalError);
  });

  it('should be able to create synthetic cause from string', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN', cause: 'rick' });
    expect(trpcError.cause).toBeInstanceOf(Error);
    expect(trpcError.cause?.message).toEqual('rick');
  });

  it('should skip creating the cause if one is not provided', () => {
    const trpcError = new TRPCError({ code: 'FORBIDDEN' });
    expect(trpcError.cause).toBeUndefined();
  });
});

describe('getTRPCErrorFromUnknown', () => {
  it('should return same error if its already TRPCError instance', () => {
    const originalError = new TRPCError({ code: 'FORBIDDEN' });
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBe(originalError);
  });

  it('should create new instance of TRPCError with `INTERNAL_SERVER_ERROR` code and same message for non-errors', () => {
    const originalError = 'rick';
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.message).toEqual('rick');
    expect(trpcError.cause).toBeInstanceOf(Error);
    expect(trpcError.cause?.message).toEqual('rick');
  });

  it('should create new instance of TRPCError with `INTERNAL_SERVER_ERROR` code and proper cause for errors', () => {
    const originalError = new Error('morty');
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.message).toEqual('morty');
    expect(trpcError.cause).toBe(originalError);
    expect(trpcError.cause?.message).toEqual('morty');
  });

  it('should preserve original stack in case new instance of TRPCError is created', () => {
    const originalError = new Error('picklerick');
    originalError.stack = 'meeseeks';
    const trpcError = getTRPCErrorFromUnknown(originalError);
    expect(trpcError.stack).toEqual('meeseeks');
  });
});
