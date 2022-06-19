import { TRPCError } from '../error/TRPCError';

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

  let errorCause: Error | undefined = undefined;
  let stack: string | undefined = undefined;

  if (cause instanceof Error) {
    errorCause = cause;
    // take stack trace from cause
    stack = cause.stack;
  }

  const err = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause: errorCause,
  });

  err.stack = stack;

  return err;
}

export function getCauseFromUnknown(cause: unknown) {
  if (cause instanceof Error) {
    return cause;
  }

  return undefined;
}
