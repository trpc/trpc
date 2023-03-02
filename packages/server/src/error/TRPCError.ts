import {
  getErrorFromUnknown,
  getMessageFromUnknownError,
} from '../error/utils';
import { TRPC_ERROR_CODE_KEY } from '../rpc/codes';

export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
  const error = getErrorFromUnknown(cause);
  // this should ideally be an `instanceof TRPCError` but for some reason that isn't working
  // ref https://github.com/trpc/trpc/issues/331
  if (error.name === 'TRPCError') {
    return cause as TRPCError;
  }

  const trpcError = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause: error,
    message: error.message,
  });

  // Inherit stack from error
  trpcError.stack = error.stack;

  return trpcError;
}

export class TRPCError extends Error {
  public readonly cause?;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const code = opts.code;
    const message =
      opts.message ?? getMessageFromUnknownError(opts.cause, code);
    const cause: Error | undefined =
      opts.cause !== undefined ? getErrorFromUnknown(opts.cause) : undefined;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = code;
    this.cause = cause;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
