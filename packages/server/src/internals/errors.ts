import { TRPCError } from '../TRPCError';

export function getMessageFromUnkownError(
  err: unknown,
  fallback: string,
): string {
  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}

export function getErrorFromUnknown(cause: unknown): TRPCError {
  // this should ideally be an `instanceof TRPCError` but for some reason that isn't working
  // ref https://github.com/trpc/trpc/issues/331
  if (cause instanceof Error && cause.name === 'TRPCError') {
    return cause as TRPCError;
  }
  const err = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause,
  });

  // take stack trace from cause
  if (cause instanceof Error) {
    err.stack = cause.stack;
  }
  return err;
}
