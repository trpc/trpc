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
  public readonly cause?: unknown;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const message =
      opts.message ?? getMessageFromUnknownError(opts.cause, opts.code);

    super(message);

    this.code = opts.code;
    this.name = this.constructor.name;
    this.cause = opts.cause;
  }
}
