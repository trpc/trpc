import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
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
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return new Error(String(cause));
  }

  // If it's an object, we'll create a synthetic error
  if (isObject(cause)) {
    return Object.assign(new UnknownCauseError(), cause);
  }

  return undefined;
}

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

  // Inherit stack from error
  if (cause instanceof Error && cause.stack) {
    trpcError.stack = cause.stack;
  }

  return trpcError;
}

export class TRPCError extends Error {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  public override readonly cause?: Error;
  public readonly code;

  constructor(opts: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    cause?: unknown;
  }) {
    const cause = getCauseFromUnknown(opts.cause);
    const message = opts.message ?? cause?.message ?? opts.code;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.code = opts.code;
    this.name = 'TRPCError';
    this.cause ??= cause;
  }
}

/** @internal */
export type CustomTRPCErrorParams<TData> = {
  message?: string;
  cause?: unknown;
  data: TData;
};

/** @internal */
export class CustomTRPCError<
  TTRPCErrorCode extends TRPC_ERROR_CODE_KEY,
  TCustomCode extends string,
  TData,
> extends TRPCError {
  public readonly customCode: TCustomCode;
  public readonly customData: TData;

  constructor(
    opts: CustomTRPCErrorParams<TData> & {
      code: TTRPCErrorCode;
      customCode: TCustomCode;
    },
  ) {
    super({
      message: opts.message ?? opts.customCode,
      code: opts.code,
      cause: opts.cause,
    });

    this.customCode = opts.customCode;
    this.customData = opts.data;
  }
}
