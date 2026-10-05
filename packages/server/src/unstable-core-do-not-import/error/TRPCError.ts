import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { isObject } from '../utils';
import { markAutomaticallyWrappedError } from './wrappedErrors';

class UnknownCauseError extends Error {
  [key: string]: unknown;

  constructor(cause: object) {
    super(getMessage(cause));
    Object.assign(this, cause);

    if (isErrorLike(cause)) {
      if (typeof cause.name === 'string') this.name = cause.name;
      if (typeof cause.stack === 'string') this.stack = cause.stack;
    }
  }
}

function getMessage(cause: object) {
  if ('message' in cause) return String(cause.message);

  return undefined;
}

/**
 * Errors from another realm (e.g. `node:vm`, iframes) fail `instanceof Error`
 * but still carry the `[object Error]` brand.
 */
function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === '[object Error]'
  );
}

export function getCauseFromUnknown(cause: unknown): Error | undefined {
  if (cause instanceof Error) {
    return cause;
  }

  const type = typeof cause;
  if (type === 'undefined' || type === 'function' || cause === null) {
    return undefined;
  }

  // Primitive types just get wrapped in an error
  if (type !== 'object') {
    // oxlint-disable-next-line typescript/no-base-to-string
    return new Error(String(cause));
  }

  // If it's an object, we'll create a synthetic error
  if (isObject(cause)) {
    return new UnknownCauseError(cause);
  }

  return undefined;
}

/**
 * Turns anything thrown into a `TRPCError`. A `TRPCError` is returned as
 * is; anything else becomes an `INTERNAL_SERVER_ERROR` with it as the
 * cause.
 */
export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
  if (cause instanceof TRPCError) {
    return cause;
  }
  if (cause instanceof Error && cause.name === 'TRPCError') {
    // https://github.com/trpc/trpc/pull/4848
    return cause as TRPCError;
  }

  const trpcError = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause,
  });

  markAutomaticallyWrappedError(trpcError);

  // Inherit stack from error
  if (isErrorLike(cause) && cause.stack) {
    trpcError.stack = cause.stack;
  }

  return trpcError;
}

/**
 * An error with a tRPC error code, which sets the HTTP status and the code
 * the client sees. Throw it from resolvers and middlewares.
 * @example
 * ```ts
 * throw new TRPCError({ code: 'NOT_FOUND', message: 'No such post' });
 * ```
 * @see https://trpc.io/docs/server/error-handling#throwing-errors
 */
export class TRPCError extends Error {
  // oxlint-disable-next-line typescript/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  /** The error this one wraps, if any. */
  public override readonly cause?: Error;
  /** The tRPC error code, such as `'NOT_FOUND'`. */
  public readonly code;

  constructor(opts: {
    /** Defaults to the cause's message, or else the code. */
    message?: string;
    /** @see https://trpc.io/docs/server/error-handling#error-codes */
    code: TRPC_ERROR_CODE_KEY;
    /** The original error. Anything that isn't an `Error` is wrapped in one. */
    cause?: unknown;
  }) {
    const cause = getCauseFromUnknown(opts.cause);
    const message = opts.message ?? cause?.message ?? opts.code;

    // oxlint-disable-next-line typescript/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = opts.code;
    this.name = 'TRPCError';
    this.cause ??= cause;
  }
}
