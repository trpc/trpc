import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import type { Overwrite, TypeError } from '../types';
import { isObject } from '../utils';

class UnknownCauseError extends Error {
  [key: string]: unknown;
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
    return new Error(String(cause));
  }

  // If it's an object, we'll create a synthetic error
  if (isObject(cause)) {
    const err = new UnknownCauseError();
    for (const key in cause) {
      err[key] = cause[key];
    }
    return err;
  }

  return undefined;
}

export function getTRPCErrorFromUnknown(
  cause: unknown,
): TRPCError | TypedTRPCError<unknown> {
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

  // Inherit stack from error
  if (cause instanceof Error && cause.stack) {
    trpcError.stack = cause.stack;
  }

  return trpcError;
}

type TRPCErrorOptions = {
  message?: string;
  code: TRPC_ERROR_CODE_KEY;
  cause?: unknown;
};

export class TRPCError extends Error {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  public override readonly cause?: Error;
  public readonly code;

  constructor(opts: TRPCErrorOptions) {
    const cause = getCauseFromUnknown(opts.cause);
    const message = opts.message ?? cause?.message ?? opts.code;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = opts.code;
    this.name = 'TRPCError';

    if (!this.cause) {
      // < ES2022 / < Node 16.9.0 compatability
      this.cause = cause;
    }
  }
}

export class TRPCInputValidationError extends TRPCError {
  constructor(cause: unknown) {
    super({
      code: 'BAD_REQUEST',
      cause,
    });
  }
}

export const trpcTypedErrorSymbol = Symbol('errorSymbol');

export type TypedTRPCError<TData> = Overwrite<TRPCError, TData> & {
  [trpcTypedErrorSymbol]: typeof trpcTypedErrorSymbol;
};

export function trpcError<
  TData extends Partial<TRPCErrorOptions> & Record<string, unknown>,
>(
  data: TData extends {
    stack?: any;
  }
    ? TypeError<"key 'stack' should not be passed to trpcError">
    : TData,
) {
  const {
    code = 'BAD_REQUEST',
    cause,
    message,
    stack: _,
    ...rest
  } = data as TData;

  const error = new TRPCError({
    code,
    cause,
    message,
  }) as TypedTRPCError<
    Overwrite<
      TData,
      {
        code: TData['code'] extends TRPC_ERROR_CODE_KEY
          ? TData['code']
          : 'BAD_REQUEST';
      }
    >
  >;

  error[trpcTypedErrorSymbol] = trpcTypedErrorSymbol;
  for (const [key, value] of Object.entries(rest)) {
    (error as any)[key] = value;
  }

  return error;
}

export function isTRPCError(
  err: unknown,
): err is TRPCError | TypedTRPCError<any> {
  return err instanceof TRPCError;
}
