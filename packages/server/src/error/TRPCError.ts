import {
  getErrorFromUnknown,
  getMessageFromUnknownError,
} from '../error/utils';
import { TRPC_ERROR_CODE_KEY } from '../rpc/codes';

export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
  const error = getErrorFromUnknown(cause);

  if (error instanceof TRPCError) {
    return error;
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
  public readonly cause?: Error;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const message =
      opts.message ?? getMessageFromUnknownError(opts.cause, opts.code);
    const cause =
      opts.cause !== undefined ? getErrorFromUnknown(opts.cause) : undefined;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = opts.code;
    this.name = this.constructor.name;
  }
}
