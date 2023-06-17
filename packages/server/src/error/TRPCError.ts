import { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { getMessageFromUnknownError } from './utils';

export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
  if (cause instanceof TRPCError) {
    return cause;
  }

  const trpcError = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause,
  });

  // Inherit stack from error
  if (cause instanceof Error && cause.stack) {
    trpcError.stack = cause.stack;
  }

  return trpcError;
}

export class TRPCError extends Error {
  public readonly cause?: Error;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const message =
      opts.message ?? getMessageFromUnknownError(opts.cause, opts.code);

    let cause = opts.cause;

    if (typeof opts.cause !== 'undefined' && typeof opts.cause !== 'object') {
      cause = new Error(String(cause));
    }

    // We know that the `cause` can sometimes be a non-Error object here, we might address that for the next major

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = opts.code;
    this.name = this.constructor.name;
  }
}
