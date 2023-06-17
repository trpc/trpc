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

function isScalar(value: unknown): value is string | number | boolean | bigint {
  return ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

export class TRPCError extends Error {
  public readonly cause?: Error;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const { cause } = opts;
    const message =
      opts.message ?? getMessageFromUnknownError(cause, opts.code);

    super(message);

    this.code = opts.code;
    this.name = this.constructor.name;

    if (cause instanceof Error) {
      this.cause = cause;
    } else if (isScalar(cause)) {
      this.cause = new Error(String(cause));
    } else if (cause != null) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- https://github.com/tc39/proposal-error-cause: widely supported, but not defined in our compilation target yet
      const causeAsError = new Error('A non-Error cause was provided', {
        cause: cause,
      });
      this.cause = causeAsError;
    }
  }
}
