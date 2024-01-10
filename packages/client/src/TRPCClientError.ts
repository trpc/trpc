import type {
  AnyProcedure,
  AnyRouter,
  DefaultErrorShape,
  inferRouterError,
  Maybe,
} from '@trpc/server';
import type { TRPCErrorResponse, TRPCErrorShape } from '@trpc/server/rpc';
import { getCauseFromUnknown } from '@trpc/server/shared';
import { isObject } from './internals/isObject';

type ErrorInferrable = AnyProcedure | AnyRouter | TRPCErrorShape<number>;

type inferErrorShape<TInferrable extends ErrorInferrable> =
  TInferrable extends AnyRouter
    ? inferRouterError<TInferrable>
    : TInferrable extends AnyProcedure
    ? TInferrable['_def']['_config']['$types']['errorShape']
    : TInferrable;

export interface TRPCClientErrorBase<TShape extends DefaultErrorShape> {
  readonly message: string;
  readonly shape: Maybe<TShape>;
  readonly data: Maybe<TShape['data']>;
}
export type TRPCClientErrorLike<TRouterOrProcedure extends ErrorInferrable> =
  TRPCClientErrorBase<inferErrorShape<TRouterOrProcedure>>;

function isTRPCClientError(cause: unknown): cause is TRPCClientError<any> {
  return (
    cause instanceof TRPCClientError ||
    /**
     * @deprecated
     * Delete in next major
     */
    (cause instanceof Error && cause.name === 'TRPCClientError')
  );
}

function isTRPCErrorResponse(obj: unknown): obj is TRPCErrorResponse<any> {
  return (
    isObject(obj) &&
    isObject(obj.error) &&
    typeof obj.error.code === 'number' &&
    typeof obj.error.message === 'string'
  );
}

export class TRPCClientError<TRouterOrProcedure extends ErrorInferrable>
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

  public static from<TRouterOrProcedure extends ErrorInferrable>(
    _cause: Error | TRPCErrorResponse<any>,
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
    if (!(cause instanceof Error)) {
      return new TRPCClientError('Unknown error', {
        ...opts,
        cause: cause as any,
      });
    }

    return new TRPCClientError(cause.message, {
      ...opts,
      cause: getCauseFromUnknown(cause),
    });
  }
}
