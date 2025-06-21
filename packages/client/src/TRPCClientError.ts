import type {
  CustomTRPCError,
  DefaultErrorData,
  DefaultErrorShape,
  inferClientTypes,
  inferProcedureErrors,
  InferrableClientTypes,
  Maybe,
  Overwrite,
  TRPC_ERROR_CODE_KEY,
  TRPCErrorResponse,
} from '@trpc/server/unstable-core-do-not-import';
import { isObject } from '@trpc/server/unstable-core-do-not-import';

type inferErrorShape<TInferrable extends InferrableClientTypes> =
  inferClientTypes<TInferrable>['errorShape'];
export interface TRPCClientErrorBase<TShape extends DefaultErrorShape> {
  readonly message: string;
  readonly shape: Maybe<TShape>;
  readonly data: Maybe<TShape['data']>;
}
export type TRPCClientErrorLike<TInferrable extends InferrableClientTypes> =
  TRPCClientErrorBase<inferErrorShape<TInferrable>>;

/**
 * Utility type to ensure that the error data is overwritten correctly
 */
type overwriteErrorData<
  TInferrable extends InferrableClientTypes,
  // Adapted from type-fest's OverrideProperties type
  // https://github.com/sindresorhus/type-fest/blob/main/source/override-properties.d.ts
  TErrorData extends Partial<Record<keyof DefaultErrorData, unknown>> & {
    [K in keyof TErrorData]: K extends keyof DefaultErrorData
      ? TErrorData[K]
      : never;
  },
> = Maybe<Overwrite<inferErrorShape<TInferrable>['data'], TErrorData>>;

export function isTRPCClientError<TInferrable extends InferrableClientTypes>(
  cause: unknown,
): cause is TRPCClientError<TInferrable> {
  return cause instanceof TRPCClientError;
}

function isTRPCErrorResponse(obj: unknown): obj is TRPCErrorResponse<any> {
  return (
    isObject(obj) &&
    isObject(obj['error']) &&
    typeof obj['error']['code'] === 'number' &&
    typeof obj['error']['message'] === 'string'
  );
}

function getMessageFromUnknownError(err: unknown, fallback: string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isObject(err) && typeof err['message'] === 'string') {
    return err['message'];
  }
  return fallback;
}

/** @internal */
export type attachError<T, TError> = T & {
  /**
   * These are just types, they can't be used at runtime
   * @internal
   */
  $types: {
    error: TError;
  };
};

export async function safe<TOutput, TError>(
  promise: attachError<Promise<TOutput>, TError>,
): Promise<[Awaited<TOutput>, undefined] | [undefined, TError]> {
  try {
    const value = await promise;
    return [value, undefined];
  } catch (error) {
    return [undefined, error as TError];
  }
}

export async function* safeAsyncIterable<TOutput, TError>(
  asyncIterable: attachError<AsyncIterable<TOutput, void, undefined>, TError>,
): AsyncGenerator<[TOutput, undefined] | [undefined, TError], void, undefined> {
  try {
    for await (const value of asyncIterable) {
      yield [value, undefined];
    }
  } catch (error) {
    yield [undefined, error as TError];
  }
}

export class TRPCClientError<TRouterOrProcedure extends InferrableClientTypes>
  extends Error
  implements TRPCClientErrorBase<inferErrorShape<TRouterOrProcedure>>
{
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  public override readonly cause;
  public readonly shape: Maybe<inferErrorShape<TRouterOrProcedure>>;
  public readonly data: Maybe<inferErrorShape<TRouterOrProcedure>['data']>;

  /**
   * Additional meta data about the error
   * In the case of HTTP-errors, we'll have `response` and potentially `responseJSON` here
   */
  public meta;

  constructor(
    message: string,
    opts?: {
      result?: Maybe<TRPCErrorResponse<inferErrorShape<TRouterOrProcedure>>>;
      cause?: Error;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;

    this.cause = cause;
    this.shape = opts?.result?.error;
    this.data = opts?.result?.error.data;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  public static from<TRouterOrProcedure extends InferrableClientTypes>(
    _cause: Error | TRPCErrorResponse<any> | object,
    opts: { meta?: Record<string, unknown> } = {},
  ): TRPCClientError<TRouterOrProcedure> {
    const cause = _cause as unknown;

    if (isTRPCClientError(cause)) {
      if (opts.meta) {
        // Decorate with meta error data
        cause.meta = {
          ...cause.meta,
          ...opts.meta,
        };
      }
      return cause;
    }
    if (isTRPCErrorResponse(cause)) {
      return new TRPCClientError(cause.error.message, {
        ...opts,
        result: cause,
      });
    }
    return new TRPCClientError(
      getMessageFromUnknownError(cause, 'Unknown error'),
      {
        ...opts,
        cause: cause as any,
      },
    );
  }
}

interface CustomTRPCClientError<
  TRouterOrProcedure extends InferrableClientTypes,
  TTRPCErrorCode extends TRPC_ERROR_CODE_KEY,
  TCustomCode extends string,
  TData,
> extends TRPCClientError<TRouterOrProcedure> {
  readonly data: overwriteErrorData<
    TRouterOrProcedure,
    {
      code: TTRPCErrorCode;
      customCode: TCustomCode;
      customData: TData;
    }
  >;
}

/** @internal */
export type inferProcedureClientErrors<
  TRoot extends InferrableClientTypes,
  TProcedure,
> =
  inferProcedureErrors<TProcedure> extends Record<string, infer $Error>
    ? $Error extends new (
        opts: any,
      ) => CustomTRPCError<infer $TRPCErrorCode, infer $CustomCode, infer $Data>
      ?
          | CustomTRPCClientError<TRoot, $TRPCErrorCode, $CustomCode, $Data>
          | TRPCClientError<TRoot>
      : TRPCClientError<TRoot>
    : TRPCClientError<TRoot>;
